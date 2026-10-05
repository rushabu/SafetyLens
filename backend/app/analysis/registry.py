"""Engine registry and the external-processing data policy.

There is no automatic fallback between engines: a batch records the engine chosen at start,
and if that engine fails the job becomes PROCESSING_ERROR.
"""
from __future__ import annotations

from typing import Protocol

from ..config import get_settings
from ..schemas.analysis import EngineInfo, EngineResult
from .baseline import BaselineEngine


class AnalysisEngine(Protocol):
    engine_type: str

    def info(self) -> EngineInfo: ...

    def analyse(self, text: str) -> EngineResult: ...


class EngineUnavailable(RuntimeError):
    pass


def get_engine(name: str) -> AnalysisEngine:
    if name == "baseline":
        return BaselineEngine()
    if name == "llm":
        settings = get_settings()
        if not settings.llm_configured:
            raise EngineUnavailable(
                "LLM engine is not configured. Set LLM_PROVIDER, LLM_MODEL and LLM_API_KEY / LLM_BASE_URL in .env."
            )
        from .llm.engine import LLMEngine

        return LLMEngine(settings)
    raise EngineUnavailable(f"Unknown engine '{name}'")


def describe_engines() -> list[dict]:
    s = get_settings()
    engines = [
        {
            "id": "baseline",
            "label": "Rule-based baseline",
            "description": "Deterministic pattern matching over a versioned lexicon. Not a trained model; runs locally.",
            "available": True,
            "external": False,
            "version": BaselineEngine().info().engine_version,
        }
    ]
    llm = {
        "id": "llm",
        "label": f"LLM ({s.llm_model})" if s.llm_configured else "LLM (not configured)",
        "description": (
            ("Local endpoint" if s.llm_endpoint_is_local else "External provider")
            + f" via {s.llm_provider}. Data policy: {s.llm_data_policy}."
            if s.llm_configured
            else "Set LLM_* variables in .env to enable."
        ),
        "available": s.llm_configured,
        "external": s.llm_configured and not s.llm_endpoint_is_local,
        "data_policy": s.llm_data_policy,
        "provider": s.llm_provider if s.llm_configured else None,
        "model": s.llm_model or None,
    }
    engines.append(llm)
    return engines


def data_policy_violation(engine: str, source_types: set[str]) -> str | None:
    """Return an error message if sending these reports to the engine breaks the data policy."""
    if engine != "llm":
        return None
    s = get_settings()
    if s.llm_endpoint_is_local or s.llm_data_policy == "all":
        return None
    non_synthetic = sorted(st for st in source_types if st != "synthetic")
    if non_synthetic:
        return (
            "Blocked by LLM_DATA_POLICY=synthetic_only: the LLM endpoint is external and this batch contains "
            f"non-synthetic reports ({', '.join(non_synthetic)}). Use the baseline, a local endpoint, or set "
            "LLM_DATA_POLICY=all after confirming real data may be sent to this provider."
        )
    return None
