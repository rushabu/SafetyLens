"""LLM analysis engine: prompt -> provider -> parse -> schema + evidence validation -> bounded retries.

Failure after the retry budget yields an EngineResult with `error` set, which is persisted as
PROCESSING_ERROR. There is no fallback to the baseline and no default to NON_SIF.
"""
from __future__ import annotations

import json
import re
import time

from pydantic import ValidationError

from ...config import Settings
from ...knowledge.loader import get_lexicon, get_rubric, get_taxonomy
from ...schemas.analysis import AnalysisOutput, EngineInfo, EngineResult
from ..validation import OutputValidationError, validate_output
from . import prompt as P
from .base import Provider, ProviderError

ENGINE_VERSION = "llm-adapter-v1.0.0"
_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)


def build_provider(settings: Settings) -> Provider:
    if settings.llm_provider == "anthropic":
        from .anthropic_provider import AnthropicProvider

        return AnthropicProvider(
            api_key=settings.llm_api_key,
            model=settings.llm_model,
            timeout_s=settings.llm_timeout_s,
            max_tokens=settings.llm_max_output_tokens,
            effort=settings.llm_effort,
            fallbacks=settings.llm_anthropic_fallbacks,
        )
    if settings.llm_provider == "openai_compatible":
        from .openai_compatible_provider import OpenAICompatibleProvider

        extra: dict = {}
        if settings.llm_extra_body.strip():
            extra = json.loads(settings.llm_extra_body)
            if not isinstance(extra, dict):
                raise ValueError("LLM_EXTRA_BODY must be a JSON object")
        return OpenAICompatibleProvider(
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key,
            model=settings.llm_model,
            timeout_s=settings.llm_timeout_s,
            max_tokens=settings.llm_max_output_tokens,
            extra_body=extra,
        )
    raise ValueError(f"Unsupported LLM_PROVIDER '{settings.llm_provider}'")


def parse_json(text: str) -> dict:
    cleaned = _FENCE.sub("", text.strip())
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("top-level JSON value is not an object")
    return data


class LLMEngine:
    engine_type = "llm"

    def __init__(self, settings: Settings, provider: Provider | None = None):
        self.settings = settings
        self.provider = provider or build_provider(settings)
        self.prompt_version = P.prompt_version(settings.llm_prompt_version or None)

    def info(self, served_model: str | None = None) -> EngineInfo:
        return EngineInfo(
            engine_type="llm",
            engine_version=f"{ENGINE_VERSION}+schema-{P.schema_fingerprint()}",
            model=f"{self.provider.name}:{served_model or self.provider.model}",
            prompt_version=self.prompt_version,
            rubric_version=get_rubric().version,
            taxonomy_version=get_taxonomy().version,
        )

    def analyse(self, text: str) -> EngineResult:
        t0 = time.perf_counter()
        system = P.system_prompt(self.prompt_version)
        schema = P.output_json_schema()
        messages: list[dict] = [{"role": "user", "content": P.user_message(text)}]
        max_attempts = 1 + max(0, self.settings.llm_max_retries)
        attempts = 0
        raw_outputs: list[str] = []
        errors: list[str] = []
        served = None

        while attempts < max_attempts:
            attempts += 1
            try:
                resp = self.provider.complete(system, messages, schema)
            except ProviderError as exc:
                errors.append(f"attempt {attempts}: provider error: {exc}")
                if not exc.retryable:
                    break
                time.sleep(min(2.0 * attempts, 6.0))
                continue
            served = resp.served_model
            raw_outputs.append(resp.text)
            problems: list[str]
            try:
                data = parse_json(resp.text)
                output = AnalysisOutput.model_validate({**data, "flags": []})
                output, rep = validate_output(output, text, strict=True)
                lex = get_lexicon()
                if any(p.search(text) for p in lex.injection):
                    output.flags.append("instruction_like_text")
                return EngineResult(
                    info=self.info(served),
                    output=output,
                    raw_output="\n---\n".join(raw_outputs),
                    validation={**rep.as_dict(), "retry_errors": errors},
                    attempts=attempts,
                    latency_ms=int((time.perf_counter() - t0) * 1000),
                )
            except (json.JSONDecodeError, ValueError) as exc:
                if isinstance(exc, ValidationError):
                    problems = [f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}" for e in exc.errors()[:10]]
                elif isinstance(exc, OutputValidationError):
                    problems = exc.problems
                else:
                    problems = [f"output is not a valid JSON object: {exc}"]
            errors.append(f"attempt {attempts}: invalid output: {'; '.join(problems)[:500]}")
            # Append-only repair turn: show the model its output and the validator's findings.
            messages = messages + [
                {"role": "assistant", "content": resp.text},
                {"role": "user", "content": P.repair_message(problems)},
            ]

        return EngineResult(
            info=self.info(served),
            error="LLM analysis failed after {} attempt(s). {}".format(attempts, " | ".join(errors)[-1500:]),
            raw_output="\n---\n".join(raw_outputs) or None,
            validation={"retry_errors": errors},
            attempts=attempts,
            latency_ms=int((time.perf_counter() - t0) * 1000),
        )
