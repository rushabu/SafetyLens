"""Report-based analytics. Density = SIF-flagged / determinate (SIF + NON_SIF) reports.

This is a REPORTED SIF PRECURSOR DENSITY - it depends on reporting culture and volume and is not
an exposure-adjusted risk rate. Abstentions and processing failures are shown, never hidden.
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..knowledge.loader import get_rubric, get_taxonomy
from ..models import ExtractedFact
from .query import UNKNOWN_SITE, Filters, apply_filters, build_frame, current_rule_tags, status_column

SIF, NON, INS, ERR, PEND = "SIF_POTENTIAL", "NON_SIF_POTENTIAL", "INSUFFICIENT_INFORMATION", "PROCESSING_ERROR", "PENDING"


def small_n() -> int:
    return int(get_rubric().thresholds.get("small_sample_n", 10))


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float | None, float | None]:
    """95% Wilson score interval for a reported proportion (uncertainty from sample size only)."""
    if not n:
        return None, None
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return round(max(0.0, centre - half), 4), round(min(1.0, centre + half), 4)


def _counts(series: pd.Series, view: str) -> dict:
    c = Counter(series.dropna().tolist())
    sif, non, ins = c.get(SIF, 0), c.get(NON, 0), c.get(INS, 0)
    det = sif + non
    low, high = wilson(sif, det)
    out = {
        "total": int(len(series)),
        "sif": sif,
        "non_sif": non,
        "insufficient": ins,
        "determinate": det,
        "density": round(sif / det, 4) if det else None,
        "density_low": low,
        "density_high": high,
        "small_sample": det < small_n(),
    }
    if view == "model":
        out["processing_errors"] = c.get(ERR, 0)
        out["pending"] = c.get(PEND, 0)
    else:
        out["unreviewed"] = int(series.isna().sum())
    return out


def _grouped(df: pd.DataFrame, key: str, view: str) -> list[dict]:
    col = status_column(view)
    rows = []
    for k, g in df.groupby(key, dropna=False):
        rows.append({"key": k if isinstance(k, str) else str(k), **_counts(g[col], view)})
    rows.sort(key=lambda r: (-r["total"], r["key"]))
    # Density rank only among groups with an adequate sample; small groups are listed, not ranked.
    eligible = sorted((r for r in rows if not r["small_sample"] and r["key"] not in ("unknown", UNKNOWN_SITE)), key=lambda r: (-(r["density"] or 0), -r["determinate"]))
    for i, r in enumerate(eligible, 1):
        r["density_rank"] = i
    for r in rows:
        r.setdefault("density_rank", None)
    return rows


def focus_areas(db: Session, df: pd.DataFrame, view: str, limit: int = 8) -> list[dict]:
    """Site x activity combinations where SIF-flagged reports concentrate, with their dominant
    model-extracted failed barriers and Life-Saving Rules. Ordered by SIF count, then density."""
    col = status_column(view)
    tax = get_taxonomy()
    done = df[df["analysis_status"] == "COMPLETED"]
    ids = [int(x) for x in done["analysis_id"].dropna().tolist()]
    barriers: dict[int, set[str]] = defaultdict(set)
    for start in range(0, len(ids), 800):
        chunk = ids[start:start + 800]
        for fact in db.execute(
            select(ExtractedFact).where(ExtractedFact.analysis_id.in_(chunk), ExtractedFact.fact_type == "barrier", ExtractedFact.status == "failed")
        ).scalars():
            barriers[fact.analysis_id].add(fact.category)
    tags = current_rule_tags(db, ids)
    out = []
    for (site, act), g in df.groupby(["site_label", "activity_label"]):
        counts = _counts(g[col], view)
        if not counts["sif"]:
            continue
        sif_rows = g[g[col] == SIF]
        b_counter: Counter = Counter()
        r_counter: Counter = Counter()
        for a in sif_rows["analysis_id"].dropna():
            b_counter.update(barriers.get(int(a), set()))
            r_counter.update(t["rule_id"] for t in tags.get(int(a), []))
        out.append(
            {
                "site": site,
                "activity": act,
                "activity_label": tax.activity_categories.get(act, act),
                **counts,
                "top_failed_barriers": [
                    {"category": k, "label": tax.barrier_categories.get(k, {}).get("label", k), "reports": v} for k, v in b_counter.most_common(3)
                ],
                "top_rules": [{"rule_id": k, "label": tax.rules.get(k, {}).get("label", k), "reports": v} for k, v in r_counter.most_common(3)],
            }
        )
    out.sort(key=lambda r: (-r["sif"], -(r["density"] or 0), r["site"], r["activity"]))
    return out[:limit]


def overview(db: Session, f: Filters) -> dict:
    base = build_frame(db)
    df = apply_filters(base, f)
    view = f.view
    tax = get_taxonomy()
    meta = {
        "filters": f.describe(),
        "small_sample_threshold": small_n(),
        "density_definition": "Reported SIF precursor density = SIF_POTENTIAL reports / reports with a determinate assessment "
        "(SIF_POTENTIAL + NON_SIF_POTENTIAL). Report-based; not exposure-adjusted risk.",
        "view_label": "Reviewer-confirmed assessments (latest review per report)"
        if view == "reviewed"
        else "Model-assessed (current analysis per report; not human-validated)",
        "excluded_by_filters": int(len(base) - len(df)) if not base.empty else 0,
        "synthetic_in_db": int((base["source_type"] == "synthetic").sum()) if not base.empty else 0,
    }
    if df.empty:
        return {"meta": meta, "summary": _empty_summary(view), "by_site": [], "by_activity": [], "trend": [], "rules": _rules_empty(tax), "barriers": [], "backlog": _backlog(df), "focus_areas": []}

    col = status_column(view)
    scoped = df if view == "model" else df  # reviewed view keeps unreviewed rows so they count as backlog
    summary = _counts(scoped[col], view)
    summary["reporting_volume"] = int(len(df))
    summary["near_duplicates_in_scope"] = int(df["near_dup"].sum())
    summary["undated"] = int(df["report_date"].isna().sum())
    if view == "reviewed":
        rv = df[df["reviewed"]]
        summary["reviewed"] = int(len(rv))
        agree = rv[(rv["model_status"] == rv["review_assessment"])]
        summary["reviewer_agreement"] = {"agree": int(len(agree)), "of": int(len(rv))}

    by_site = _grouped(df, "site_label", view)
    by_activity = _grouped(df, "activity_label", view)
    for r in by_activity:
        r["label"] = tax.activity_categories.get(r["key"], r["key"])

    dated = df[df["month"].notna()]
    trend = []
    for month, g in dated.groupby("month"):
        trend.append({"month": month, **_counts(g[col], view)})
    trend.sort(key=lambda r: r["month"])

    return {
        "meta": meta,
        "summary": summary,
        "by_site": by_site,
        "by_activity": by_activity,
        "trend": trend,
        "rules": rule_distribution(db, df, view),
        "barriers": barrier_frequencies(db, df),
        "backlog": _backlog(df),
        "focus_areas": focus_areas(db, df, view),
    }


def _empty_summary(view: str) -> dict:
    s = _counts(pd.Series([], dtype=object), view)
    s.update({"reporting_volume": 0, "near_duplicates_in_scope": 0, "undated": 0})
    return s


def _rules_empty(tax) -> dict:  # noqa: ANN001
    return {"rows": [], "reports_with_any_tag": 0, "total_tags": 0, "reports_in_scope": 0, "note": ""}


def rule_distribution(db: Session, df: pd.DataFrame, view: str) -> dict:
    tax = get_taxonomy()
    per_rule: dict[str, Counter] = defaultdict(Counter)
    per_rule_sif: Counter = Counter()
    reports_with_tag = 0
    total_tags = 0
    if view == "reviewed":
        rv = df[df["reviewed"]]
        for _, r in rv.iterrows():
            tags = r["review_rule_tags"] or []
            if tags:
                reports_with_tag += 1
            for t in tags:
                per_rule[t["rule_id"]][t.get("status", "unclear")] += 1
                total_tags += 1
                if r["review_assessment"] == SIF:
                    per_rule_sif[t["rule_id"]] += 1
        scope = len(rv)
    else:
        done = df[df["analysis_status"] == "COMPLETED"]
        ids = [int(x) for x in done["analysis_id"].dropna().tolist()]
        tags_by = current_rule_tags(db, ids)
        assess = dict(zip(done["analysis_id"].astype(int), done["model_assessment"]))
        for aid, tags in tags_by.items():
            reports_with_tag += 1
            for t in tags:
                per_rule[t["rule_id"]][t["status"]] += 1
                total_tags += 1
                if assess.get(aid) == SIF:
                    per_rule_sif[t["rule_id"]] += 1
        scope = len(done)
    rows = []
    for rid, info in tax.rules.items():
        c = per_rule.get(rid, Counter())
        n = sum(c.values())
        rows.append(
            {
                "rule_id": rid,
                "label": info["label"],
                "reports": n,
                "breach": c.get("breach", 0),
                "control": c.get("control", 0),
                "unclear": c.get("unclear", 0),
                "sif_reports": per_rule_sif.get(rid, 0),
            }
        )
    return {
        "rows": rows,
        "reports_with_any_tag": reports_with_tag,
        "total_tags": total_tags,
        "reports_in_scope": int(scope),
        "note": "Multi-label: one report can carry several rule tags, so tag counts can exceed report counts. "
        "Rule relevance is assessed independently of SIF potential.",
    }


def barrier_frequencies(db: Session, df: pd.DataFrame) -> list[dict]:
    tax = get_taxonomy()
    done = df[df["analysis_status"] == "COMPLETED"]
    ids = [int(x) for x in done["analysis_id"].dropna().tolist()]
    if not ids:
        return []
    assess = dict(zip(done["analysis_id"].astype(int), done["model_assessment"]))
    counts: dict[str, Counter] = defaultdict(Counter)
    for start in range(0, len(ids), 800):
        chunk = ids[start:start + 800]
        for fact in db.execute(
            select(ExtractedFact).where(ExtractedFact.analysis_id.in_(chunk), ExtractedFact.fact_type == "barrier")
        ).scalars():
            counts[fact.category][fact.status or "unknown"] += 1
            if fact.status == "failed" and assess.get(fact.analysis_id) == SIF:
                counts[fact.category]["failed_in_sif"] += 1
    rows = [
        {
            "category": cat,
            "label": tax.barrier_categories.get(cat, {}).get("label", cat),
            "failed": c.get("failed", 0),
            "effective": c.get("effective", 0),
            "unknown": c.get("unknown", 0),
            "failed_in_sif": c.get("failed_in_sif", 0),
        }
        for cat, c in counts.items()
    ]
    rows.sort(key=lambda r: (-r["failed"], -r["effective"], r["label"]))
    return rows


def _backlog(df: pd.DataFrame) -> dict:
    if df.empty:
        return {"unreviewed_completed": 0, "by_assessment": {}, "processing_errors": 0, "pending": 0, "oldest_unreviewed": None}
    done = df[(df["analysis_status"] == "COMPLETED") & (~df["reviewed"])]
    by = Counter(done["model_assessment"].tolist())
    oldest = done["created_at"].min() if not done.empty else None
    return {
        "unreviewed_completed": int(len(done)),
        "by_assessment": {SIF: by.get(SIF, 0), INS: by.get(INS, 0), NON: by.get(NON, 0)},
        "processing_errors": int((df["model_status"] == ERR).sum()),
        "pending": int((df["model_status"] == PEND).sum()),
        "oldest_unreviewed": (oldest.isoformat() + "Z") if oldest is not None and not pd.isna(oldest) else None,
    }


def filter_options(db: Session) -> dict:
    df = build_frame(db)
    tax = get_taxonomy()
    if df.empty:
        return {"sites": [], "activities": [], "source_types": [], "date_min": None, "date_max": None, "rules": _rule_opts(tax)}
    dates = df["report_date"].dropna()
    return {
        "sites": sorted(df["site_label"].unique().tolist()),
        "activities": [
            {"id": a, "label": tax.activity_categories.get(a, a)} for a in sorted(df["activity_label"].unique().tolist())
        ],
        "source_types": sorted(df["source_type"].unique().tolist()),
        "date_min": dates.min().isoformat() if not dates.empty else None,
        "date_max": dates.max().isoformat() if not dates.empty else None,
        "rules": _rule_opts(tax),
    }


def _rule_opts(tax) -> list[dict]:  # noqa: ANN001
    return [{"id": rid, "label": r["label"]} for rid, r in tax.rules.items()]
