"""Persist an EngineResult as a new, current analysis version for a report."""
from __future__ import annotations

from sqlalchemy import update
from sqlalchemy.orm import Session

from ..models import Analysis, EvidenceSpan, ExtractedFact, Report, RuleTag
from ..schemas.analysis import EngineResult, Quote


def _spans(a: Analysis, owner_type: str, owner_key: str, quotes: list[Quote]) -> None:
    for q in quotes:
        if q.start is None or q.end is None:
            continue
        a.spans.append(EvidenceSpan(owner_type=owner_type, owner_key=owner_key, start=q.start, end=q.end, quote=q.quote))


def save_result(db: Session, report: Report, result: EngineResult) -> Analysis:
    db.execute(update(Analysis).where(Analysis.report_id == report.id).values(is_current=False))
    info = result.info
    a = Analysis(
        report_id=report.id,
        is_current=True,
        engine_type=info.engine_type,
        engine_version=info.engine_version,
        model=info.model,
        prompt_version=info.prompt_version,
        rubric_version=info.rubric_version,
        taxonomy_version=info.taxonomy_version,
        raw_output=result.raw_output,
        validation=result.validation,
        attempts=result.attempts,
        latency_ms=result.latency_ms,
    )
    if not result.ok:
        # A failure is a PROCESSING_ERROR with no assessment. It is never mapped to NON_SIF.
        a.status = "PROCESSING_ERROR"
        a.assessment = None
        a.error = result.error or "Unknown processing error"
        db.add(a)
        db.flush()
        return a

    o = result.output
    assert o is not None
    a.status = "COMPLETED"
    a.assessment = o.assessment
    a.rationale = o.rationale
    a.event_modality = o.event_modality
    a.evidence_sufficiency = o.evidence_sufficiency
    a.activity_category = o.activity.category if o.activity else None
    a.exposure_status = o.exposure.status
    a.flags = o.flags
    a.output = o.model_dump()

    if o.activity:
        a.facts.append(ExtractedFact(fact_type="activity", category=o.activity.category, value=o.activity.description))
        _spans(a, "activity", o.activity.category, o.activity.evidence)
    for h in o.hazards:
        a.facts.append(ExtractedFact(fact_type="hazard", category=h.category, value=h.description))
        _spans(a, "hazard", h.category, h.evidence)
    a.facts.append(ExtractedFact(fact_type="exposure", category=o.exposure.status, value=o.exposure.description, status=o.exposure.status))
    _spans(a, "exposure", o.exposure.status, o.exposure.evidence)
    for b in o.barriers:
        a.facts.append(ExtractedFact(fact_type="barrier", category=b.category, value=b.description, status=b.status, critical=b.critical))
        _spans(a, "barrier", b.category, b.evidence)
    if o.potential_consequence:
        a.facts.append(ExtractedFact(fact_type="consequence", value=o.potential_consequence.description))
        _spans(a, "consequence", "consequence", o.potential_consequence.evidence)
    for oh in o.other_hazards:
        a.facts.append(ExtractedFact(fact_type="other_hazard", category=oh.id, value=oh.explanation))
        _spans(a, "other_hazard", oh.id, oh.evidence)
    for m in o.missing_information:
        a.facts.append(ExtractedFact(fact_type="missing_info", value=m))
    for t in o.rule_tags:
        a.rule_tags.append(RuleTag(rule_id=t.rule_id, relevance=t.relevance, status=t.status, explanation=t.explanation))
        _spans(a, "rule_tag", t.rule_id, t.evidence)
    db.add(a)
    db.flush()
    return a
