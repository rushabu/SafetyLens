"""Hosted provider: Anthropic Messages API via the official SDK.

Structured outputs (`output_config.format` json_schema) constrain the response to the schema.
Server-side refusal fallbacks are enabled by default (LLM_ANTHROPIC_FALLBACKS=true); the model
that actually served the response is recorded for audit.
"""
from __future__ import annotations

import anthropic

from .base import ProviderError, ProviderResponse


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, *, api_key: str, model: str, timeout_s: float, max_tokens: int, effort: str, fallbacks: bool):
        # SDK-level retries handle 429/5xx/connection errors; our engine adds validation retries.
        self.client = anthropic.Anthropic(api_key=api_key, timeout=timeout_s, max_retries=2)
        self.model = model
        self.max_tokens = max_tokens
        self.effort = effort
        self.fallbacks = fallbacks

    def complete(self, system: str, messages: list[dict], schema: dict) -> ProviderResponse:
        params = dict(
            model=self.model,
            max_tokens=self.max_tokens,
            system=system,
            messages=messages,
            output_config={"effort": self.effort, "format": {"type": "json_schema", "schema": schema}},
        )
        try:
            if self.fallbacks:
                response = self.client.beta.messages.create(
                    **params, betas=["server-side-fallback-2026-07-01"], fallbacks="default"
                )
            else:
                response = self.client.messages.create(**params)
        except anthropic.AuthenticationError as exc:
            raise ProviderError("Authentication failed - check LLM_API_KEY.", retryable=False) from exc
        except anthropic.PermissionDeniedError as exc:
            raise ProviderError(f"Permission denied by provider: {exc.message}", retryable=False) from exc
        except anthropic.NotFoundError as exc:
            raise ProviderError(f"Model or endpoint not found ({self.model}).", retryable=False) from exc
        except anthropic.BadRequestError as exc:
            raise ProviderError(f"Provider rejected the request: {exc.message}", retryable=False) from exc
        except anthropic.RateLimitError as exc:
            raise ProviderError("Rate limited by provider.", retryable=True) from exc
        except anthropic.APIStatusError as exc:
            raise ProviderError(f"Provider error {exc.status_code}: {exc.message}", retryable=exc.status_code >= 500) from exc
        except anthropic.APIConnectionError as exc:
            raise ProviderError("Could not reach the provider (network error or timeout).", retryable=True) from exc

        if response.stop_reason == "refusal":
            category = getattr(getattr(response, "stop_details", None), "category", None)
            raise ProviderError(f"Model declined the request (refusal, category={category}).", retryable=False)
        if response.stop_reason == "max_tokens":
            raise ProviderError("Output truncated at max_tokens; raise LLM_MAX_OUTPUT_TOKENS.", retryable=True)
        text = next((b.text for b in response.content if b.type == "text"), "")
        if not text:
            raise ProviderError("Provider returned no text content.", retryable=True)
        usage = getattr(response, "usage", None)
        return ProviderResponse(
            text=text,
            served_model=response.model,
            input_tokens=getattr(usage, "input_tokens", None),
            output_tokens=getattr(usage, "output_tokens", None),
        )
