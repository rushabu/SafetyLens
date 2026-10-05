"""CSV export of filtered reports with their current analysis and latest review."""
from __future__ import annotations

import io

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Analysis, ExtractedFact, RuleTag

EXPORT_COLUMNS = [
    "safetylens_id", "report_id", "site", "report_date", "report_type", "source_type", "provenance",
    "near_duplicate_flag", "analysis_status", "model_assessment", "rationale", "event_modality",
    "evidence_sufficiency", "activity", "hazards", "exposure", "failed_barriers", "effective_barriers",
    "unknown_barriers", "rule_tags", "other_hazards", "missing_information", "engine", "engine_version", "model",
    "prompt_version", "rubric_version", "taxonomy_version", "processing_error", "review_assessment",
    "review_rule_tags", "reviewer", "reviewed_at", "review_action", "report_text",
]


def _safe(v: object) -> object:
    """Neutralise spreadsheet formula injection in exported text cells."""
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v


def export_csv(db: Session, df: pd.DataFrame) -> str:
    ids = [int(x) for x in df["analysis_id"].dropna().tolist()] if not df.empty else []
    analyses: dict[int, Analysis] = {}
    facts: dict[int, list[ExtractedFact]] = {}
    tags: dict[int, list[RuleTag]] = {}
    for start in range(0, len(ids), 800):
        chunk = ids[start:start + 800]
        for a in db.execute(select(Analysis).where(Analysis.id.in_(chunk))).scalars():
            analyses[a.id] = a
        for fct in db.execute(select(ExtractedFact).where(ExtractedFact.analysis_id.in_(chunk))).scalars():
            facts.setdefault(fct.analysis_id, []).append(fct)
        for t in db.execute(select(RuleTag).where(RuleTag.analysis_id.in_(chunk))).scalars():
            tags.setdefault(t.analysis_id, []).append(t)

    rows = []
    for _, r in df.iterrows():
        aid = int(r["analysis_id"]) if pd.notna(r["analysis_id"]) else None
        a = analyses.get(aid) if aid else None
        fs = facts.get(aid, []) if aid else []

        def of(kind: str, status: str | None = None) -> str:
            return "; ".join(
                sorted({(x.category or x.value or "") for x in fs if x.fact_type == kind and (status is None or x.status == status)})
            )

        review_tags = r["review_rule_tags"] if isinstance(r["review_rule_tags"], list) else []
        rows.append(
            {
                "safetylens_id": r["uid"],
                "report_id": r["external_id"],
                "site": r["site"],
                "report_date": r["report_date"].isoformat() if pd.notna(r["report_date"]) and r["report_date"] is not None else None,
                "report_type": r["report_type"],
                "source_type": r["source_type"],
                "provenance": r["provenance"],
                "near_duplicate_flag": bool(r["near_dup"]),
                "analysis_status": r["analysis_status"] or "PENDING",
                "model_assessment": r["model_assessment"],
                "rationale": a.rationale if a else None,
                "event_modality": r["modality"],
                "evidence_sufficiency": r["sufficiency"],
                "activity": r["activity"],
                "hazards": of("hazard"),
                "exposure": r["exposure_status"],
                "failed_barriers": of("barrier", "failed"),
                "effective_barriers": of("barrier", "effective"),
                "unknown_barriers": of("barrier", "unknown"),
                "rule_tags": "; ".join(f"{t.rule_id}:{t.status}" for t in sorted(tags.get(aid, []), key=lambda t: t.rule_id)) if aid else "",
                "other_hazards": of("other_hazard"),
                "missing_information": " | ".join(x.value or "" for x in fs if x.fact_type == "missing_info"),
                "engine": a.engine_type if a else None,
                "engine_version": a.engine_version if a else None,
                "model": a.model if a else None,
                "prompt_version": a.prompt_version if a else None,
                "rubric_version": a.rubric_version if a else None,
                "taxonomy_version": a.taxonomy_version if a else None,
                "processing_error": a.error if a else None,
                "review_assessment": r["review_assessment"],
                "review_rule_tags": "; ".join(f"{t['rule_id']}:{t.get('status', 'unclear')}" for t in review_tags),
                "reviewer": r["reviewer"],
                "reviewed_at": (r["reviewed_at"].isoformat() + "Z") if pd.notna(r["reviewed_at"]) and r["reviewed_at"] is not None else None,
                "review_action": r["review_action"],
                "report_text": r["text"],
            }
        )
    out = pd.DataFrame(rows, columns=EXPORT_COLUMNS)
    out = out.map(_safe)
    buf = io.StringIO()
    out.to_csv(buf, index=False)
    return buf.getvalue()
