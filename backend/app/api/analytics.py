from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..analysis.registry import describe_engines
from ..config import get_settings
from ..db import get_db
from ..knowledge.loader import get_lexicon, get_rubric, get_taxonomy
from ..models import EvalRun
from ..services.analytics import filter_options, overview
from ..services.patterns import detect_patterns
from ..services.query import Filters
from .common import filters_dep, iso

router = APIRouter(prefix="/api", tags=["analytics"])


@router.get("/meta")
def meta() -> dict:
    s = get_settings()
    tax = get_taxonomy()
    rub = get_rubric()
    return {
        "app": "SafetyLens",
        "app_version": "0.1.0-prototype",
        "default_engine": s.analysis_engine if (s.analysis_engine == "baseline" or s.llm_configured) else "baseline",
        "engines": describe_engines(),
        "taxonomy": {
            "version": tax.version,
            "source_urls": tax.source_urls,
            "source_note": tax.raw["source"].get("note"),
            "rules": [{"id": k, **v} for k, v in tax.rules.items()],
            "other_hazards": [{"id": k, "label": v} for k, v in tax.other_hazards.items()],
            "activity_categories": tax.activity_categories,
            "hazard_categories": tax.hazard_categories,
            "barrier_categories": tax.barrier_categories,
        },
        "rubric": {
            "version": rub.version,
            "status": rub.status,
            "owner_note": rub.raw.get("owner_note"),
            "classes": rub.raw["classes"],
            "principles": rub.raw["principles"],
            "small_sample_n": rub.thresholds.get("small_sample_n", 10),
        },
        "lexicon_version": get_lexicon().version,
    }


@router.get("/filters/options")
def options(db: Session = Depends(get_db)) -> dict:
    return filter_options(db)


@router.get("/analytics/overview")
def analytics_overview(f: Filters = Depends(filters_dep), db: Session = Depends(get_db)) -> dict:
    return overview(db, f)


@router.get("/patterns")
def patterns(
    f: Filters = Depends(filters_dep),
    min_support: int = Query(2, ge=2, le=50),
    group_by: Literal["activity_hazard_barrier", "site_activity_barrier", "site_hazard_barrier"] = "activity_hazard_barrier",
    db: Session = Depends(get_db),
) -> dict:
    return detect_patterns(db, f, min_support=min_support, group_by=group_by)


@router.get("/eval/runs")
def eval_runs(db: Session = Depends(get_db)) -> list[dict]:
    runs = db.execute(select(EvalRun).order_by(EvalRun.id.desc())).scalars().all()
    return [
        {
            "id": r.id,
            "dataset": r.dataset,
            "split": r.split,
            "engine": r.engine,
            "engine_version": r.engine_version,
            "model": r.model,
            "label_provenance": r.label_provenance,
            "n_cases": r.n_cases,
            "headline": {
                k: r.metrics.get("sif", {}).get(k)
                for k in ("precision", "recall", "f1")
            }
            | {"coverage": r.metrics.get("abstention", {}).get("coverage")},
            "created_at": iso(r.created_at),
        }
        for r in runs
    ]


@router.get("/eval/runs/{run_id}")
def eval_run(run_id: int, db: Session = Depends(get_db)) -> dict:
    r = db.get(EvalRun, run_id)
    if r is None:
        raise HTTPException(404, "Evaluation run not found")
    return {
        "id": r.id,
        "dataset": r.dataset,
        "split": r.split,
        "engine": r.engine,
        "engine_version": r.engine_version,
        "model": r.model,
        "label_provenance": r.label_provenance,
        "n_cases": r.n_cases,
        "metrics": r.metrics,
        "created_at": iso(r.created_at),
    }
