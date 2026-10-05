"""The engine output contract shared by the baseline and the LLM adapter.

Category fields are plain strings here; `app.analysis.validation` checks them against the
versioned taxonomy so the vocabulary stays configurable.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Assessment = Literal["SIF_POTENTIAL", "NON_SIF_POTENTIAL", "INSUFFICIENT_INFORMATION"]
ASSESSMENTS: tuple[str, ...] = ("SIF_POTENTIAL", "NON_SIF_POTENTIAL", "INSUFFICIENT_INFORMATION")
Modality = Literal["actual", "prevented", "hypothetical", "historical", "unclear"]
ExposureStatus = Literal["actual", "credible", "prevented", "none", "unknown"]
BarrierStatus = Literal["failed", "effective", "unknown"]
RuleStatus = Literal["breach", "control", "unclear"]
Relevance = Literal["primary", "secondary"]
Sufficiency = Literal["strong", "moderate", "limited", "insufficient"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Quote(_Strict):
    quote: str = Field(min_length=1, max_length=1000)
    start: int | None = Field(default=None, ge=0)
    end: int | None = Field(default=None, ge=0)


class Activity(_Strict):
    category: str
    description: str | None = None
    evidence: list[Quote] = Field(default_factory=list)


class Hazard(_Strict):
    category: str
    description: str | None = None
    evidence: list[Quote] = Field(default_factory=list)


class Exposure(_Strict):
    status: ExposureStatus = "unknown"
    description: str | None = None
    evidence: list[Quote] = Field(default_factory=list)


class Barrier(_Strict):
    category: str
    description: str | None = None
    status: BarrierStatus = "unknown"
    critical: bool = True
    evidence: list[Quote] = Field(default_factory=list)


class Consequence(_Strict):
    description: str | None = None
    evidence: list[Quote] = Field(default_factory=list)


class RuleTagOut(_Strict):
    rule_id: str
    relevance: Relevance = "primary"
    status: RuleStatus = "unclear"
    explanation: str = Field(default="", max_length=600)
    evidence: list[Quote] = Field(default_factory=list)


class OtherHazard(_Strict):
    id: str
    explanation: str = Field(default="", max_length=600)
    evidence: list[Quote] = Field(default_factory=list)


class AnalysisOutput(_Strict):
    assessment: Assessment
    rationale: str = Field(min_length=1, max_length=1200)
    event_modality: Modality = "unclear"
    activity: Activity | None = None
    hazards: list[Hazard] = Field(default_factory=list)
    exposure: Exposure = Field(default_factory=Exposure)
    barriers: list[Barrier] = Field(default_factory=list)
    potential_consequence: Consequence | None = None
    rule_tags: list[RuleTagOut] = Field(default_factory=list)
    other_hazards: list[OtherHazard] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    evidence_sufficiency: Sufficiency = "insufficient"
    flags: list[str] = Field(default_factory=list)


class EngineInfo(BaseModel):
    engine_type: Literal["baseline", "llm"]
    engine_version: str
    model: str | None = None
    prompt_version: str | None = None
    rubric_version: str
    taxonomy_version: str


class EngineResult(BaseModel):
    """What an engine run returns: a validated output or a processing error, never both."""

    info: EngineInfo
    output: AnalysisOutput | None = None
    error: str | None = None
    raw_output: str | None = None
    validation: dict | None = None
    attempts: int = 1
    latency_ms: int = 0

    @property
    def ok(self) -> bool:
        return self.output is not None and self.error is None
