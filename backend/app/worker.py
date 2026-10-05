"""Application-owned background worker backed by the `analysis_jobs` table.

- Job state is persisted; progress survives restarts.
- On startup, jobs left `running` by a crash/restart become `interrupted` (retryable), and their
  batch shows "interrupted" with a Resume action. Nothing is silently re-run.
- Completed jobs are never re-run by page refreshes; re-analysis is an explicit API action.
"""
from __future__ import annotations

import logging
import threading
import time

from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from .analysis.registry import EngineUnavailable, data_policy_violation, get_engine
from .config import get_settings
from .db import SessionLocal
from .models import AnalysisJob, Batch, Report, utcnow
from .schemas.analysis import EngineResult
from .services.persist import save_result

log = logging.getLogger("safetylens.worker")


def recompute_batch_status(db: Session, batch_id: int | None) -> None:
    if batch_id is None:
        return
    batch = db.get(Batch, batch_id)
    if batch is None:
        return
    counts = dict(
        db.execute(
            select(AnalysisJob.status, func.count()).where(AnalysisJob.batch_id == batch_id).group_by(AnalysisJob.status)
        ).all()
    )
    if counts.get("running"):
        batch.status = "processing"
    elif counts.get("queued"):
        batch.status = "processing" if (counts.get("done") or counts.get("failed")) else "queued"
    elif counts.get("interrupted"):
        batch.status = "interrupted"
    elif counts.get("failed"):
        batch.status = "completed_with_errors"
    else:
        batch.status = "completed"


def recover_interrupted() -> int:
    """Mark jobs left running by a previous process as interrupted. Returns count."""
    with SessionLocal() as db:
        running = db.execute(select(AnalysisJob).where(AnalysisJob.status == "running")).scalars().all()
        for job in running:
            job.status = "interrupted"
            job.last_error = "Interrupted by server restart before completion. Resume the batch to retry."
            job.finished_at = utcnow()
        for bid in {j.batch_id for j in running}:
            recompute_batch_status(db, bid)
        db.commit()
        return len(running)


def _claim(db: Session) -> int | None:
    row = db.execute(
        text(
            "UPDATE analysis_jobs SET status='running', attempts=attempts+1, started_at=:now, heartbeat_at=:now "
            "WHERE id = (SELECT id FROM analysis_jobs WHERE status='queued' ORDER BY id LIMIT 1) RETURNING id"
        ),
        {"now": utcnow()},
    ).first()
    db.commit()
    return row[0] if row else None


def process_one() -> bool:
    """Claim and process a single queued job. Returns False when the queue is empty."""
    with SessionLocal() as db:
        job_id = _claim(db)
        if job_id is None:
            return False
        job = db.get(AnalysisJob, job_id)
        assert job is not None
        report = db.get(Report, job.report_id)
        if job.batch_id:
            recompute_batch_status(db, job.batch_id)
            db.commit()
        result: EngineResult | None = None
        error: str | None = None
        try:
            engine = get_engine(job.engine)
            violation = data_policy_violation(job.engine, {report.source_type})
            if violation:
                error = violation
                result = EngineResult(info=engine.info(), error=violation)
            else:
                result = engine.analyse(report.report_text)
        except EngineUnavailable as exc:
            error = str(exc)
        except Exception as exc:  # noqa: BLE001 - any engine crash must become PROCESSING_ERROR
            log.exception("analysis crashed for job %s", job_id)
            error = f"Engine crashed: {type(exc).__name__}: {exc}"

        if result is None:
            from .analysis.baseline import BaselineEngine
            from .schemas.analysis import EngineInfo

            base = BaselineEngine().info()
            info = EngineInfo(
                engine_type="llm" if job.engine == "llm" else "baseline",
                engine_version="unavailable" if job.engine == "llm" else base.engine_version,
                model=get_settings().llm_model or None if job.engine == "llm" else None,
                rubric_version=base.rubric_version,
                taxonomy_version=base.taxonomy_version,
            )
            result = EngineResult(info=info, error=error or "Unknown error")

        analysis = save_result(db, report, result)
        job.analysis_id = analysis.id
        job.status = "done" if result.ok else "failed"
        job.last_error = None if result.ok else result.error
        job.finished_at = utcnow()
        recompute_batch_status(db, job.batch_id)
        db.commit()
        return True


def requeue(db: Session, batch_id: int, statuses: tuple[str, ...]) -> int:
    n = db.execute(
        update(AnalysisJob)
        .where(AnalysisJob.batch_id == batch_id, AnalysisJob.status.in_(statuses))
        .values(status="queued", last_error=None)
    ).rowcount
    recompute_batch_status(db, batch_id)
    db.commit()
    return n or 0


class Worker:
    def __init__(self, poll_interval: float | None = None):
        self.poll_interval = poll_interval or get_settings().worker_poll_interval_s
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="safetylens-worker", daemon=True)
        self._thread.start()

    def stop(self, timeout: float = 10.0) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout)

    def _run(self) -> None:
        log.info("worker started")
        while not self._stop.is_set():
            try:
                if not process_one():
                    self._stop.wait(self.poll_interval)
            except Exception:  # noqa: BLE001
                log.exception("worker loop error")
                self._stop.wait(2.0)
        log.info("worker stopped")
