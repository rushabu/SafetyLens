"""Deterministic recurring-pattern detection.

Groups reports by normalised categories taken from each report's current analysis - activity,
harm mechanism (hazard), failed barrier - optionally combined with location (site). Categories
come from the controlled taxonomy vocabulary, so grouping is reproducible. Every pattern lists the
real reports that support it.
"""
from __future__ import annotations

import hashlib
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..knowledge.loader import get_rubric, get_taxonomy
from ..models import ExtractedFact
from .query import UNKNOWN_SITE, Filters, apply_filters, build_frame, status_column

NO_FAILED_BARRIER = "no_failed_barrier_stated"

GROUPINGS = {
    "activity_hazard_barrier": ("activity", "hazard", "barrier"),
    "site_activity_barrier": ("site", "activity", "barrier"),
    "site_hazard_barrier": ("site", "hazard", "barrier"),
}


def detect_patterns(
    db: Session, f: Filters, *, min_support: int = 2, max_reports: int = 100, group_by: str = "activity_hazard_barrier"
) -> dict:
    tax = get_taxonomy()
    serious = set(get_rubric().serious_mechanisms)
    dims = GROUPINGS.get(group_by, GROUPINGS["activity_hazard_barrier"])
    df = apply_filters(build_frame(db), f)
    meta = {
        "filters": f.describe(),
        "group_by": group_by if group_by in GROUPINGS else "activity_hazard_barrier",
        "dimensions": list(dims),
        "method": "Deterministic grouping of normalised "
        + " / ".join({"site": "location (site)", "activity": "activity", "hazard": "harm mechanism", "barrier": "failed barrier"}[d] for d in dims)
        + " extracted by the current analysis of each report. A report can support several patterns.",
        "min_support": min_support,
        "assessment_view": f.view,
    }
    if df.empty:
        return {"meta": meta, "patterns": [], "reports_considered": 0}
    done = df[df["analysis_status"] == "COMPLETED"]
    ids = [int(x) for x in done["analysis_id"].dropna().tolist()]
    hazards: dict[int, set[str]] = defaultdict(set)
    failed: dict[int, set[str]] = defaultdict(set)
    for start in range(0, len(ids), 800):
        chunk = ids[start:start + 800]
        for fact in db.execute(
            select(ExtractedFact).where(ExtractedFact.analysis_id.in_(chunk), ExtractedFact.fact_type.in_(["hazard", "barrier"]))
        ).scalars():
            if fact.fact_type == "hazard" and fact.category:
                hazards[fact.analysis_id].add(fact.category)
            elif fact.fact_type == "barrier" and fact.status == "failed" and fact.category:
                failed[fact.analysis_id].add(fact.category)

    col = status_column(f.view)
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for _, r in done.iterrows():
        aid = int(r["analysis_id"])
        hs = hazards.get(aid) or set()
        if "hazard" in dims and not hs:
            continue
        if "hazard" not in dims and not hs and not failed.get(aid):
            continue  # nothing precursor-like to group on
        values = {
            "site": [r["site_label"]],
            "activity": [r["activity_label"]],
            "hazard": sorted(hs) or [None],
            "barrier": sorted(failed.get(aid) or {NO_FAILED_BARRIER}),
        }
        rep = {
            "id": int(r["id"]),
            "uid": r["uid"],
            "external_id": r["external_id"],
            "site": r["site"],
            "report_date": r["report_date"].isoformat() if r["report_date"] is not None and str(r["report_date"]) != "NaT" else None,
            "assessment": r[col] if isinstance(r[col], str) else None,
            "source_type": r["source_type"],
        }
        keys: list[tuple] = [()]
        for d in dims:
            keys = [k + (v,) for k in keys for v in values[d]]
        for k in keys:
            groups[k].append(rep)

    small = int(get_rubric().thresholds.get("small_sample_n", 10))
    patterns = []
    for key, reps in groups.items():
        if len(reps) < min_support:
            continue
        kv = dict(zip(dims, key))
        act, hz, bar, site = kv.get("activity"), kv.get("hazard"), kv.get("barrier"), kv.get("site")
        sif = sum(1 for x in reps if x["assessment"] == "SIF_POTENTIAL")
        dates = sorted(x["report_date"] for x in reps if x["report_date"])
        pid = hashlib.sha1("|".join(f"{d}={v}" for d, v in kv.items()).encode()).hexdigest()[:10]
        patterns.append(
            {
                "id": pid,
                "site": site,
                "activity": act,
                "activity_label": tax.activity_categories.get(act, act) if act else None,
                "hazard": hz,
                "hazard_label": tax.hazard_categories.get(hz, {}).get("label", hz) if hz else None,
                "hazard_serious": hz in serious if hz else False,
                "barrier": bar,
                "barrier_label": "No failed barrier stated"
                if bar == NO_FAILED_BARRIER
                else tax.barrier_categories.get(bar, {}).get("label", bar),
                "report_count": len(reps),
                "sif_count": sif,
                "insufficient_count": sum(1 for x in reps if x["assessment"] == "INSUFFICIENT_INFORMATION"),
                "sites": sorted({x["site"] or UNKNOWN_SITE for x in reps}),
                "first_date": dates[0] if dates else None,
                "last_date": dates[-1] if dates else None,
                "small_sample": len(reps) < small,
                "reports": reps[:max_reports],
                "reports_truncated": len(reps) > max_reports,
            }
        )
    patterns.sort(key=lambda p: (p["barrier"] == NO_FAILED_BARRIER, -p["sif_count"], -p["report_count"], p["id"]))
    return {"meta": meta, "patterns": patterns, "reports_considered": int(len(done))}
