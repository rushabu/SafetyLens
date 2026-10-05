"""Append-only reviewer decisions. The model's analysis is never modified."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..knowledge.loader import get_taxonomy
from ..models import Analysis, Report, Review
from ..schemas.analysis import ASSESSMENTS

RULE_STATUSES = {"breach", "control", "unclear"}


class ReviewRejected(ValueError):
    pass


def create_review(
    db: Session,
    report: Report,
    *,
    reviewer: str,
    assessment: str,
    rule_tags: list[dict],
    notes: str | None,
    analysis_id: int | None,
) -> Review:
    reviewer = (reviewer or "").strip()
    if not reviewer:
        raise ReviewRejected("Reviewer name is required for the audit trail.")
    if assessment not in ASSESSMENTS:
        raise ReviewRejected(f"assessment must be one of {', '.join(ASSESSMENTS)}")
    tax = get_taxonomy()
    clean: dict[str, str] = {}
    for t in rule_tags or []:
        rid, st = t.get("rule_id"), t.get("status", "unclear")
        if rid not in tax.rules:
            raise ReviewRejected(f"Unknown rule_id '{rid}'")
        if st not in RULE_STATUSES:
            raise ReviewRejected(f"Unknown rule status '{st}'")
        clean[rid] = st
    tags = [{"rule_id": k, "status": v} for k, v in sorted(clean.items())]

    current = db.execute(
        select(Analysis).where(Analysis.report_id == report.id, Analysis.is_current.is_(True))
    ).scalars().first()
    target = current
    if analysis_id is not None:
        target = db.get(Analysis, analysis_id)
        if target is None or target.report_id != report.id:
            raise ReviewRejected("analysis_id does not belong to this report")
        if current is not None and target.id != current.id:
            raise ReviewRejected(
                "The report was re-analysed since you opened it. Reload to review the current analysis."
            )

    model_assessment = target.assessment if target and target.status == "COMPLETED" else None
    model_tags = sorted((t.rule_id, t.status) for t in (target.rule_tags if target else []))
    same = model_assessment == assessment and model_tags == sorted((t["rule_id"], t["status"]) for t in tags)
    review = Review(
        report_id=report.id,
        analysis_id=target.id if target else None,
        reviewer=reviewer[:120],
        action="confirm" if same else "correct",
        assessment=assessment,
        rule_tags=tags,
        model_assessment=model_assessment,
        notes=(notes or "").strip() or None,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review
