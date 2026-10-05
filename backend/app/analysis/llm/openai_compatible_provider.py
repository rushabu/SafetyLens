"""Generic provider for any OpenAI-compatible chat-completions endpoint.

Works with local model servers (Ollama, vLLM, LM Studio, llama.cpp server) and hosted
OpenAI-compatible APIs such as Groq. Requests JSON-schema output; falls back to plain JSON
mode if the server rejects `json_schema`. The output is validated by SafetyLens either way.
"""
from __future__ import annotations

import re
import time

import httpx

from .base import ProviderError, ProviderResponse

MAX_RATE_LIMIT_WAITS = 4
MAX_RATE_LIMIT_SLEEP_S = 60.0


def _rate_limit_message(resp: httpx.Response) -> str:
    """Provider's rate-limit explanation without account identifiers."""
    try:
        msg = resp.json()["error"]["message"]
    except (ValueError, KeyError, TypeError):
        msg = ""
    msg = re.sub(r"\s+in organization `[^`]*`", "", msg)
    msg = re.sub(r"\s*Need more tokens\?.*$", "", msg)
    retry = resp.headers.get("retry-after")
    return (msg or "quota exceeded") + (f" (retry after {retry}s)" if retry and retry not in msg else "")


class OpenAICompatibleProvider:
    name = "openai_compatible"

    def __init__(self, *, base_url: str, api_key: str, model: str, timeout_s: float, max_tokens: int, extra_body: dict | None = None):
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.headers = {"Content-Type": "application/json"}
        if api_key:
            self.headers["Authorization"] = f"Bearer {api_key}"
        self.model = model
        self.timeout_s = timeout_s
        self.max_tokens = max_tokens
        self.extra_body = extra_body or {}
        self._schema_supported = True

    def _post(self, body: dict) -> httpx.Response:
        """POST with bounded waiting on HTTP 429, honouring the server's retry-after hint."""
        for wait_round in range(MAX_RATE_LIMIT_WAITS + 1):
            try:
                resp = httpx.post(self.url, json=body, headers=self.headers, timeout=self.timeout_s)
            except httpx.TimeoutException as exc:
                raise ProviderError(f"Timed out after {self.timeout_s}s waiting for {self.url}", retryable=True) from exc
            except httpx.HTTPError as exc:
                raise ProviderError(f"Could not reach {self.url}: {type(exc).__name__}", retryable=True) from exc
            if resp.status_code != 429 or wait_round == MAX_RATE_LIMIT_WAITS:
                return resp
            try:
                delay = float(resp.headers.get("retry-after", "5"))
            except ValueError:
                delay = 5.0
            # A long wait (e.g. a daily token quota) is not worth blocking the worker for: fail fast
            # with the provider's message so the report becomes a visible, retryable processing error.
            if delay > MAX_RATE_LIMIT_SLEEP_S or resp.headers.get("x-should-retry", "").lower() == "false":
                return resp
            time.sleep(max(delay, 1.0))
        return resp  # pragma: no cover

    def complete(self, system: str, messages: list[dict], schema: dict) -> ProviderResponse:
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, *messages],
            "temperature": 0,
            "max_tokens": self.max_tokens,
            **self.extra_body,
        }
        if self._schema_supported:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "sif_analysis", "schema": schema, "strict": True},
            }
        else:
            body["response_format"] = {"type": "json_object"}
        resp = self._post(body)
        if resp.status_code == 400 and self._schema_supported and "json_schema" in resp.text:
            self._schema_supported = False
            body["response_format"] = {"type": "json_object"}
            resp = self._post(body)
        if resp.status_code in (401, 403):
            raise ProviderError(f"Endpoint rejected credentials (HTTP {resp.status_code}). Check LLM_API_KEY / LLM_API_KEY_FILE.", retryable=False)
        if resp.status_code == 404:
            raise ProviderError(f"Endpoint or model not found (HTTP 404) at {self.url} for model {self.model}.", retryable=False)
        if resp.status_code == 429:
            raise ProviderError(f"Rate limited by the provider: {_rate_limit_message(resp)}", retryable=False)
        if resp.status_code >= 500:
            raise ProviderError(f"Endpoint returned HTTP {resp.status_code}.", retryable=True)
        if resp.status_code >= 400:
            # Some servers reject a schema-conforming answer they could not produce (e.g. Groq
            # "json_validate_failed"); treat as retryable so the repair loop can try again.
            retry = "json_validate_failed" in resp.text or "failed_generation" in resp.text
            raise ProviderError(f"Endpoint returned HTTP {resp.status_code}: {resp.text[:300]}", retryable=retry)
        try:
            data = resp.json()
            choice = data["choices"][0]
            text = choice["message"]["content"] or ""
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError("Endpoint returned an unexpected response shape.", retryable=True) from exc
        if choice.get("finish_reason") == "length":
            raise ProviderError("Output truncated (finish_reason=length); raise LLM_MAX_OUTPUT_TOKENS.", retryable=True)
        usage = data.get("usage") or {}
        return ProviderResponse(
            text=text,
            served_model=data.get("model") or self.model,
            input_tokens=usage.get("prompt_tokens"),
            output_tokens=usage.get("completion_tokens"),
        )
