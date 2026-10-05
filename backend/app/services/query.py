"""One shared report frame + filter implementation so tables, charts, patterns and exports
always count the same reports."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Analysis, Report, Review, RuleTag

DEFAULT_SOURCE_TYPES = ("operational", "manual")
UNKNOWN_SITE = "Unknown site"


@dataclass
class Filters:
    date_from: date | None = None
    date_to: date | None = None
    sites: list[str] = field(default_factory=list)
    activities: list[str] = field(default_factory=list)
    source_types: list[str] = field(default_factory=lambda: list(DEFAULT_SOURCE_TYPES))
    include_near_duplicates: bool = True
    view: str = "model"  # model | reviewed

    def describe(self) -> dict:
        return {
            "date_from": self.date_from.isoformat() if self.date_from else None,
            "date_to": self.date_to.isoformat() if self.date_to else None,
            "sites": self.sites,
            "activities": self.activities,
            "source_types": self.source_types,
            "include_near_duplicates": self.include_near_duplicates,
            "view": self.view,
            "notes": [
                "Exact duplicates are never imported, so they are never counted.",
                "Probable near-duplicates are "
                + ("included" if self.include_near_duplicates else "excluded")
                + " in these figures.",
                "Synthetic reports are "
                + ("included" if "synthetic" in self.source_types else "excluded")
                + ".",
            ],
        }


COLUMNS = [
    "id", "uid", "external_id", "site", "report_date", "report_type", "source_type", "provenance",
    "near_dup", "batch_id", "text", "analysis_id", "analysis_status", "model_assessment", "activity",
    "exposure_status", "sufficiency", "modality", "engine_type", "model", "review_id", "review_assessment",
    "review_rule_tags", "reviewer", "reviewed_at", "review_action", "created_at",
]


def build_frame(db: Session) -> pd.DataFrame:
    latest_review = (
        select(Review.report_id, func.max(Review.id).label("rid")).group_by(Review.report_id).subquery()
    )
    stmt = (
        select(
            Report.id, Report.report_uid, Report.external_report_id, Report.site, Report.report_date,
            Report.report_type, Report.source_type, Report.provenance, Report.near_duplicate_of_id,
            Report.batch_id, Report.report_text, Analysis.id, Analysis.status, Analysis.assessment,
            Analysis.activity_category, Analysis.exposure_status, Analysis.evidence_sufficiency,
            Analysis.event_modality, Analysis.engine_type, Analysis.model, Review.id, Review.assessment,
            Review.rule_tags, Review.reviewer, Review.created_at, Review.action, Report.created_at,
        )
        .select_from(Report)
        .outerjoin(Analysis, (Analysis.report_id == Report.id) & (Analysis.is_current.is_(True)))
        .outerjoin(latest_review, latest_review.c.report_id == Report.id)
        .outerjoin(Review, Review.id == latest_review.c.rid)
        .order_by(Report.id)
    )
    rows = db.execute(stmt).all()
    df = pd.DataFrame(rows, columns=COLUMNS)
    if df.empty:
        return df
    for c in ("analysis_id", "review_id", "batch_id"):
        df[c] = df[c].astype("Int64")
    df["near_dup"] = df["near_dup"].notna()
    df["site_label"] = df["site"].fillna(UNKNOWN_SITE)
    df["activity_label"] = df["activity"].fillna("unknown")
    df["model_status"] = df["analysis_status"].map({"PROCESSING_ERROR": "PROCESSING_ERROR"})
    df.loc[df["analysis_status"] == "COMPLETED", "model_status"] = df["model_assessment"]
    df["model_status"] = df["model_status"].fillna("PENDING")
    df["reviewed"] = df["review_id"].notna()
    df["month"] = pd.to_datetime(df["report_date"], errors="coerce").dt.to_period("M").astype(str)
    df.loc[df["report_date"].isna(), "month"] = None
    return df


def apply_filters(df: pd.DataFrame, f: Filters) -> pd.DataFrame:
    if df.empty:
        return df
    m = df["source_type"].isin(f.source_types)
    if f.date_from:
        m &= df["report_date"].notna() & (df["report_date"] >= f.date_from)
    if f.date_to:
        m &= df["report_date"].notna() & (df["report_date"] <= f.date_to)
    if f.sites:
        m &= df["site_label"].isin(f.sites)
    if f.activities:
        m &= df["activity_label"].isin(f.activities)
    if not f.include_near_duplicates:
        m &= ~df["near_dup"]
    return df[m]


def status_column(view: str) -> str:
    return "review_assessment" if view == "reviewed" else "model_status"


def current_rule_tags(db: Session, analysis_ids: list[int]) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {}
    if not analysis_ids:
        return out
    for chunk_start in range(0, len(analysis_ids), 800):
        chunk = analysis_ids[chunk_start:chunk_start + 800]
        for t in db.execute(select(RuleTag).where(RuleTag.analysis_id.in_(chunk))).scalars():
            out.setdefault(t.analysis_id, []).append({"rule_id": t.rule_id, "status": t.status, "relevance": t.relevance})
    for v in out.values():
        v.sort(key=lambda x: x["rule_id"])
    return out
