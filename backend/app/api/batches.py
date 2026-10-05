from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AnalysisJob, Batch, ImportRowIssue, Report
from ..worker import requeue
from .common import iso

router = APIRouter(prefix="/api/batches", tags=["batches"])


def batch_summary(db: Session, b: Batch) -> dict:
    counts = dict(
        db.execute(
            select(AnalysisJob.status, func.count()).where(AnalysisJob.batch_id == b.id).group_by(AnalysisJob.status)
        ).all()
    )
    total = sum(counts.values())
    finished = counts.get("done", 0) + counts.get("failed", 0)
    return {
        "id": b.id,
        "name": b.name,
        "kind": b.kind,
        "filename": b.filename,
        "source_type": b.source_type,
        "provenance": b.provenance,
        "engine": b.engine,
        "status": b.status,
        "total_rows": b.total_rows,
        "imported_rows": b.imported_rows,
        "skipped_duplicates": b.skipped_duplicates,
        "rejected_rows": b.rejected_rows,
        "near_duplicates": b.near_duplicates,
        "jobs": {
            "total": total,
            "queued": counts.get("queued", 0),
            "running": counts.get("running", 0),
            "done": counts.get("done", 0),
            "failed": counts.get("failed", 0),
            "interrupted": counts.get("interrupted", 0),
            "finished": finished,
        },
        "created_at": iso(b.created_at),
        "updated_at": iso(b.updated_at),
    }


@router.get("")
def list_batches(db: Session = Depends(get_db)) -> list[dict]:
    batches = db.execute(select(Batch).order_by(Batch.id.desc()).limit(200)).scalars().all()
    return [batch_summary(db, b) for b in batches]


@router.get("/{batch_id}")
def get_batch(batch_id: int, db: Session = Depends(get_db)) -> dict:
    b = db.get(Batch, batch_id)
    if b is None:
        raise HTTPException(404, "Batch not found")
    issues = db.execute(
        select(ImportRowIssue).where(ImportRowIssue.batch_id == b.id).order_by(ImportRowIssue.row_number)
    ).scalars().all()
    failed = db.execute(
        select(AnalysisJob, Report.report_uid, Report.external_report_id)
        .join(Report, Report.id == AnalysisJob.report_id)
        .where(AnalysisJob.batch_id == b.id, AnalysisJob.status.in_(["failed", "interrupted"]))
        .order_by(AnalysisJob.id)
    ).all()
    return {
        **batch_summary(db, b),
        "row_issues": [
            {"row_number": i.row_number, "severity": i.severity, "code": i.code, "message": i.message} for i in issues
        ],
        "failed_jobs": [
            {
                "job_id": j.id,
                "report_id": j.report_id,
                "report_uid": uid,
                "external_report_id": ext,
                "status": j.status,
                "attempts": j.attempts,
                "error": j.last_error,
            }
            for j, uid, ext in failed
        ],
    }


@router.post("/{batch_id}/resume")
def resume(batch_id: int, db: Session = Depends(get_db)) -> dict:
    b = db.get(Batch, batch_id)
    if b is None:
        raise HTTPException(404, "Batch not found")
    n = requeue(db, batch_id, ("interrupted",))
    return {"requeued": n, "batch": batch_summary(db, b)}


@router.post("/{batch_id}/retry-failed")
def retry_failed(batch_id: int, db: Session = Depends(get_db)) -> dict:
    b = db.get(Batch, batch_id)
    if b is None:
        raise HTTPException(404, "Batch not found")
    n = requeue(db, batch_id, ("failed", "interrupted"))
    return {"requeued": n, "batch": batch_summary(db, b)}
