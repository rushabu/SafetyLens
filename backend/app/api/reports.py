from __future__ import annotations

from typing import Literal

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..analysis.registry import EngineUnavailable, data_policy_violation, get_engine
from ..db import get_db
from ..models import Analysis, AnalysisJob, Report, Review
from ..services.export import export_csv
from ..services.query import Filters, apply_filters, build_frame, current_rule_tags, status_column
from ..services.reviews import ReviewRejected, create_review
from .common import filters_dep, iso

router = APIRouter(prefix="/api", tags=["reports"])

SORTS = {
    "date_desc": ("report_date", False),
    "date_asc": ("report_date", True),
    "created_desc": ("id", False),
    "created_asc": ("id", True),
    "site": ("site_label", True),
}
# Triage priority: unreviewed SIF first, then abstentions (facts needed), then processing errors.
TRIAGE_ORDER = {"SIF_POTENTIAL": 0, "INSUFFICIENT_INFORMATION": 1, "PROCESSING_ERROR": 2, "PENDING": 3, "NON_SIF_POTENTIAL": 4}


def _filtered(
    db: Session,
    f: Filters,
    q: str | None,
    assessment: list[str],
    rule: list[str],
    review_status: str | None,
    batch_id: int | None = None,
) -> pd.DataFrame:
    df = apply_filters(build_frame(db), f)
    if df.empty:
        return df
    if batch_id is not None:
        df = df[df["batch_id"] == batch_id]
    col = status_column(f.view)
    if q:
        ql = q.lower()
        m = (
            df["text"].str.lower().str.contains(ql, regex=False)
            | df["uid"].str.lower().str.contains(ql, regex=False)
            | df["external_id"].fillna("").str.lower().str.contains(ql, regex=False)
            | df["site_label"].str.lower().str.contains(ql, regex=False)
        )
        df = df[m]
    if assessment:
        df = df[df[col].isin(assessment)]
    if review_status == "reviewed":
        df = df[df["reviewed"]]
    elif review_status == "unreviewed":
        df = df[~df["reviewed"]]
    if rule and not df.empty:
        if f.view == "reviewed":
            keep = df["review_rule_tags"].apply(lambda tags: bool(tags) and any(t["rule_id"] in rule for t in tags))
        else:
            ids = [int(x) for x in df["analysis_id"].dropna().tolist()]
            tags = current_rule_tags(db, ids)
            ok = {aid for aid, ts in tags.items() if any(t["rule_id"] in rule for t in ts)}
            keep = df["analysis_id"].apply(lambda a: pd.notna(a) and int(a) in ok)
        df = df[keep]
    return df


@router.get("/reports")
def list_reports(
    f: Filters = Depends(filters_dep),
    q: str | None = None,
    assessment: list[str] = Query(default=[]),
    rule: list[str] = Query(default=[]),
    review_status: Literal["reviewed", "unreviewed"] | None = None,
    batch_id: int | None = None,
    sort: str = "date_desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict:
    df = _filtered(db, f, q, assessment, rule, review_status, batch_id)
    total = int(len(df))
    if total and sort == "triage":
        df = df.assign(_t=df["model_status"].map(TRIAGE_ORDER).fillna(9) + df["reviewed"].astype(int) * 10)
        df = df.sort_values(["_t", "report_date", "id"], ascending=[True, False, False], na_position="last")
    elif total:
        key, asc = SORTS.get(sort, SORTS["date_desc"])
        df = df.sort_values([key, "id"], ascending=[asc, False], na_position="last")
    page_df = df.iloc[(page - 1) * page_size : page * page_size] if total else df
    ids = [int(x) for x in page_df["analysis_id"].dropna().tolist()] if total else []
    tags = current_rule_tags(db, ids)
    items = []
    for _, r in page_df.iterrows():
        aid = int(r["analysis_id"]) if pd.notna(r["analysis_id"]) else None
        items.append(
            {
                "id": int(r["id"]),
                "uid": r["uid"],
                "external_id": r["external_id"],
                "site": r["site"],
                "report_date": r["report_date"].isoformat() if r["report_date"] is not None and pd.notna(r["report_date"]) else None,
                "report_type": r["report_type"],
                "source_type": r["source_type"],
                "near_duplicate": bool(r["near_dup"]),
                "excerpt": r["text"][:220],
                "status": r["model_status"],
                "model_assessment": r["model_assessment"],
                "activity": r["activity"],
                "sufficiency": r["sufficiency"],
                "engine_type": r["engine_type"],
                "rule_tags": tags.get(aid, []) if aid else [],
                "reviewed": bool(r["reviewed"]),
                "review_assessment": r["review_assessment"],
                "review_rule_tags": r["review_rule_tags"] if isinstance(r["review_rule_tags"], list) else [],
                "reviewer": r["reviewer"],
                "reviewed_at": iso(r["reviewed_at"]) if pd.notna(r["reviewed_at"]) else None,
            }
        )
    return {"items": items, "total": total, "page": page, "page_size": page_size, "filters": f.describe()}


@router.get("/export/reports.csv")
def export_reports(
    f: Filters = Depends(filters_dep),
    q: str | None = None,
    assessment: list[str] = Query(default=[]),
    rule: list[str] = Query(default=[]),
    review_status: Literal["reviewed", "unreviewed"] | None = None,
    batch_id: int | None = None,
    db: Session = Depends(get_db),
) -> Response:
    df = _filtered(db, f, q, assessment, rule, review_status, batch_id)
    if not df.empty:
        df = df.sort_values("id")
    csv = export_csv(db, df)
    return Response(
        csv,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="safetylens_reports.csv"'},
    )


def _analysis_full(a: Analysis) -> dict:
    return {
        "id": a.id,
        "is_current": a.is_current,
        "status": a.status,
        "assessment": a.assessment,
        "rationale": a.rationale,
        "event_modality": a.event_modality,
        "evidence_sufficiency": a.evidence_sufficiency,
        "engine_type": a.engine_type,
        "engine_version": a.engine_version,
        "model": a.model,
        "prompt_version": a.prompt_version,
        "rubric_version": a.rubric_version,
        "taxonomy_version": a.taxonomy_version,
        "error": a.error,
        "attempts": a.attempts,
        "latency_ms": a.latency_ms,
        "validation": a.validation,
        "flags": a.flags or [],
        "output": a.output,
        "spans": [
            {"id": s.id, "owner_type": s.owner_type, "owner_key": s.owner_key, "start": s.start, "end": s.end, "quote": s.quote}
            for s in sorted(a.spans, key=lambda s: (s.start, s.end))
        ],
        "created_at": iso(a.created_at),
    }


def _review_dict(r: Review) -> dict:
    return {
        "id": r.id,
        "analysis_id": r.analysis_id,
        "reviewer": r.reviewer,
        "action": r.action,
        "assessment": r.assessment,
        "model_assessment": r.model_assessment,
        "rule_tags": r.rule_tags,
        "notes": r.notes,
        "created_at": iso(r.created_at),
    }


@router.get("/reports/{report_id}")
def get_report(report_id: int, db: Session = Depends(get_db)) -> dict:
    r = db.get(Report, report_id)
    if r is None:
        raise HTTPException(404, "Report not found")
    current = next((a for a in r.analyses if a.is_current), None)
    pending = db.execute(
        select(AnalysisJob)
        .where(AnalysisJob.report_id == r.id, AnalysisJob.status.in_(["queued", "running", "interrupted"]))
        .order_by(AnalysisJob.id.desc())
    ).scalars().first()
    near = db.get(Report, r.near_duplicate_of_id) if r.near_duplicate_of_id else None
    near_me = db.execute(select(Report.id, Report.report_uid).where(Report.near_duplicate_of_id == r.id)).all()
    return {
        "report": {
            "id": r.id,
            "uid": r.report_uid,
            "external_id": r.external_report_id,
            "text": r.report_text,
            "site": r.site,
            "report_date": iso(r.report_date),
            "report_date_raw": r.report_date_raw,
            "report_type": r.report_type,
            "source_type": r.source_type,
            "provenance": r.provenance,
            "extra_fields": r.extra_fields,
            "batch": {"id": r.batch.id, "name": r.batch.name} if r.batch else None,
            "created_at": iso(r.created_at),
            "near_duplicate_of": {"id": near.id, "uid": near.report_uid} if near else None,
            "near_duplicate_score": r.near_duplicate_score,
            "near_duplicates": [{"id": i, "uid": u} for i, u in near_me],
        },
        "analysis": _analysis_full(current) if current else None,
        "analyses": [
            {
                "id": a.id,
                "is_current": a.is_current,
                "status": a.status,
                "assessment": a.assessment,
                "engine_type": a.engine_type,
                "model": a.model,
                "created_at": iso(a.created_at),
            }
            for a in reversed(r.analyses)
        ],
        "reviews": [_review_dict(x) for x in reversed(r.reviews)],
        "pending_job": {"id": pending.id, "status": pending.status, "engine": pending.engine} if pending else None,
    }


@router.get("/analyses/{analysis_id}")
def get_analysis(analysis_id: int, db: Session = Depends(get_db)) -> dict:
    a = db.get(Analysis, analysis_id)
    if a is None:
        raise HTTPException(404, "Analysis not found")
    return _analysis_full(a)


class ReanalyseBody(BaseModel):
    engine: Literal["baseline", "llm"] = "baseline"


@router.post("/reports/{report_id}/reanalyse")
def reanalyse(report_id: int, body: ReanalyseBody, db: Session = Depends(get_db)) -> dict:
    r = db.get(Report, report_id)
    if r is None:
        raise HTTPException(404, "Report not found")
    busy = db.execute(
        select(AnalysisJob).where(AnalysisJob.report_id == r.id, AnalysisJob.status.in_(["queued", "running"]))
    ).scalars().first()
    if busy:
        return {"job_id": busy.id, "status": busy.status, "already_pending": True}
    try:
        get_engine(body.engine)
    except EngineUnavailable as exc:
        raise HTTPException(400, str(exc)) from exc
    violation = data_policy_violation(body.engine, {r.source_type})
    if violation:
        raise HTTPException(400, violation)
    job = AnalysisJob(batch_id=None, report_id=r.id, engine=body.engine, status="queued")
    db.add(job)
    db.commit()
    return {"job_id": job.id, "status": job.status, "already_pending": False}


class RuleTagIn(BaseModel):
    rule_id: str
    status: Literal["breach", "control", "unclear"] = "unclear"


class ReviewIn(BaseModel):
    reviewer: str = Field(min_length=1, max_length=120)
    assessment: Literal["SIF_POTENTIAL", "NON_SIF_POTENTIAL", "INSUFFICIENT_INFORMATION"]
    rule_tags: list[RuleTagIn] = Field(default_factory=list)
    notes: str | None = Field(default=None, max_length=4000)
    analysis_id: int | None = None


@router.get("/reports/{report_id}/reviews")
def list_reviews(report_id: int, db: Session = Depends(get_db)) -> list[dict]:
    r = db.get(Report, report_id)
    if r is None:
        raise HTTPException(404, "Report not found")
    return [_review_dict(x) for x in reversed(r.reviews)]


@router.post("/reports/{report_id}/reviews")
def add_review(report_id: int, body: ReviewIn, db: Session = Depends(get_db)) -> dict:
    r = db.get(Report, report_id)
    if r is None:
        raise HTTPException(404, "Report not found")
    try:
        rev = create_review(
            db,
            r,
            reviewer=body.reviewer,
            assessment=body.assessment,
            rule_tags=[t.model_dump() for t in body.rule_tags],
            notes=body.notes,
            analysis_id=body.analysis_id,
        )
    except ReviewRejected as exc:
        raise HTTPException(409 if "re-analysed" in str(exc) else 400, str(exc)) from exc
    return _review_dict(rev)
