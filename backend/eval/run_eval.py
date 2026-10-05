"""Reproducible evaluation of an analysis engine against SEPARATE reference labels.

Results on the bundled dataset are SYNTHETIC / ILLUSTRATIVE: the reports and labels were written by
the prototype authors, the labels are not expert-validated, and nothing here measures performance on
OIL data. The runner calls engines in memory and never writes analyses into the application tables;
reference labels are never passed to an engine.

Usage:
  python -m eval.run_eval --engine baseline --split test
  python -m eval.run_eval --engine llm --split test --limit 20     # requires LLM_* settings
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import statistics
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from app.analysis.registry import EngineUnavailable, get_engine
from app.analysis.validation import locate_quote
from app.db import SessionLocal, init_db
from app.models import EvalReferenceLabel, EvalRun

REPO = Path(__file__).resolve().parents[2]
DEFAULT_DATASET = REPO / "data" / "synthetic"
RESULTS = Path(__file__).resolve().parent / "results"
S, N, I, E = "SIF_POTENTIAL", "NON_SIF_POTENTIAL", "INSUFFICIENT_INFORMATION", "PROCESSING_ERROR"
LABEL_PROVENANCE = (
    "SYNTHETIC / ILLUSTRATIVE: author-assigned labels on generator-produced reports; not expert validated; "
    "not representative of OIL data."
)


def load_dataset(path: Path) -> tuple[list[dict], dict[str, dict]]:
    with open(path / "synthetic_reports.csv", encoding="utf-8") as fh:
        reports = list(csv.DictReader(fh))
    with open(path / "reference_labels.csv", encoding="utf-8") as fh:
        labels = {r["report_id"]: r for r in csv.DictReader(fh)}
    return reports, labels


def _prf(tp: int, fp: int, fn: int) -> dict:
    p = tp / (tp + fp) if tp + fp else None
    r = tp / (tp + fn) if tp + fn else None
    f = 2 * p * r / (p + r) if p and r else (0.0 if p is not None and r is not None else None)
    return {"precision": _r(p), "recall": _r(r), "f1": _r(f), "tp": tp, "fp": fp, "fn": fn}


def _r(x: float | None) -> float | None:
    return round(x, 4) if x is not None else None


def compute_metrics(cases: list[dict], rule_ids: list[str]) -> dict:
    n = len(cases)
    classes = [S, N, I, E]
    confusion = {ref: {pred: 0 for pred in classes} for ref in (S, N, I)}
    for c in cases:
        confusion[c["ref"]][c["pred"]] += 1
    pred_counts = Counter(c["pred"] for c in cases)
    ref_counts = Counter(c["ref"] for c in cases)

    tp = confusion[S][S]
    pred_sif = pred_counts[S]
    ref_sif = ref_counts[S]
    precision = tp / pred_sif if pred_sif else None
    recall_e2e = tp / ref_sif if ref_sif else None
    answered_ref_sif = confusion[S][S] + confusion[S][N]
    recall_answered = tp / answered_ref_sif if answered_ref_sif else None
    f1 = 2 * precision * recall_e2e / (precision + recall_e2e) if precision and recall_e2e else None

    determinate = pred_counts[S] + pred_counts[N]
    correct3 = sum(confusion[k][k] for k in (S, N, I))

    # Multi-label rule tagging
    per_rule = {}
    micro = Counter()
    for rid in rule_ids:
        tp_r = sum(1 for c in cases if rid in c["pred_rules"] and rid in c["ref_rules"])
        fp_r = sum(1 for c in cases if rid in c["pred_rules"] and rid not in c["ref_rules"])
        fn_r = sum(1 for c in cases if rid not in c["pred_rules"] and rid in c["ref_rules"])
        per_rule[rid] = {**_prf(tp_r, fp_r, fn_r), "support": tp_r + fn_r}
        micro.update({"tp": tp_r, "fp": fp_r, "fn": fn_r})
    supported = [v for v in per_rule.values() if v["support"] > 0]
    macro_f1 = statistics.mean([v["f1"] or 0.0 for v in supported]) if supported else None
    exact_set = sum(1 for c in cases if c["pred"] != E and set(c["pred_rules"]) == set(c["ref_rules"]))

    spans_total = sum(c["spans_total"] for c in cases)
    spans_valid = sum(c["spans_valid"] for c in cases)
    lat = [c["latency_ms"] for c in cases]
    return {
        "n": n,
        "reference_distribution": dict(ref_counts),
        "prediction_distribution": dict(pred_counts),
        "confusion_matrix": confusion,
        "confusion_note": "Rows = reference label, columns = engine output. PROCESSING_ERROR is a failure, not a class.",
        "sif": {
            "precision": _r(precision),
            "recall": _r(recall_e2e),
            "recall_on_answered": _r(recall_answered),
            "f1": _r(f1),
            "tp": tp,
            "predicted_sif": pred_sif,
            "reference_sif": ref_sif,
            "note": "recall (end-to-end) counts abstentions and errors on reference-SIF cases as not captured.",
        },
        "sif_capture": {
            "reference_sif": ref_sif,
            "captured": confusion[S][S],
            "abstained": confusion[S][I],
            "missed_as_non_sif": confusion[S][N],
            "errored": confusion[S][E],
        },
        "abstention": {
            "abstention_rate": _r(pred_counts[I] / n) if n else None,
            "coverage": _r(determinate / n) if n else None,
            "determinate": determinate,
            "insufficient": pred_counts[I],
        },
        "three_class_accuracy": _r(correct3 / n) if n else None,
        "rules": {
            "micro": _prf(micro["tp"], micro["fp"], micro["fn"]),
            "macro_f1": _r(macro_f1),
            "exact_set_match_rate": _r(exact_set / n) if n else None,
            "per_rule": per_rule,
            "note": "Rule relevance is scored independently of SIF assessment. Cases with no reference rules count when the engine adds tags.",
        },
        "evidence": {
            "quotes_checked": spans_total,
            "quotes_valid": spans_valid,
            "validity_rate": _r(spans_valid / spans_total) if spans_total else None,
            "invalid_quotes_removed_by_validator": sum(c["invalid_removed"] for c in cases),
            "note": "Persisted spans re-checked against the original text (text[start:end] == quote). Quotes the "
            "validator could not locate were removed before persistence and are counted separately.",
        },
        "latency_ms": {
            "mean": _r(statistics.mean(lat)) if lat else None,
            "p50": _r(statistics.median(lat)) if lat else None,
            "p95": _r(sorted(lat)[max(0, int(0.95 * len(lat)) - 1)]) if lat else None,
        },
        "processing_failures": pred_counts[E],
    }


def _all_quotes(output: dict) -> list[dict]:
    qs: list[dict] = []
    if output.get("activity"):
        qs += output["activity"]["evidence"]
    for key in ("hazards", "barriers", "rule_tags", "other_hazards"):
        for item in output.get(key) or []:
            qs += item.get("evidence") or []
    qs += (output.get("exposure") or {}).get("evidence") or []
    if output.get("potential_consequence"):
        qs += output["potential_consequence"]["evidence"]
    return qs


def _checkpoint_path(engine_name: str, info) -> Path:  # noqa: ANN001
    import hashlib

    key = f"{engine_name}|{info.engine_version}|{info.model}|{info.prompt_version}|{info.rubric_version}|{info.taxonomy_version}"
    return RESULTS / "checkpoints" / f"{engine_name}_{hashlib.sha1(key.encode()).hexdigest()[:12]}.jsonl"


def run(
    engine_name: str,
    split: str,
    dataset: Path,
    limit: int | None,
    store: bool = True,
    per_group: int | None = None,
    resume: bool = True,
) -> dict:
    from app.knowledge.loader import get_taxonomy

    reports, labels = load_dataset(dataset)
    rows = [r for r in reports if r["report_id"] in labels and (split == "all" or labels[r["report_id"]]["split"] == split)]
    if per_group:
        # Stratified sample: the first `per_group` reports of every scenario group (keeps all groups).
        seen: dict[str, int] = {}
        kept = []
        for r in rows:
            gid = labels[r["report_id"]]["scenario_group"]
            if seen.get(gid, 0) < per_group:
                kept.append(r)
                seen[gid] = seen.get(gid, 0) + 1
        rows = kept
    if limit:
        rows = rows[:limit]
    engine = get_engine(engine_name)
    # Per-case checkpoint (successful cases only) so a slow, rate-limited run can resume after an
    # interruption. Keyed by engine/model/prompt/rubric/taxonomy versions and the exact report text.
    ckpt = _checkpoint_path(engine_name, engine.info()) if resume and store else None
    done: dict[str, dict] = {}
    if ckpt and ckpt.exists():
        for line in ckpt.read_text(encoding="utf-8").splitlines():
            c = json.loads(line)
            done[c["_key"]] = c
    cases = []
    for i, r in enumerate(rows, 1):
        text = r["report_text"]
        ckey = f'{r["report_id"]}|{hashlib.sha1(text.encode()).hexdigest()}'
        if ckey in done:
            cases.append({k: v for k, v in done[ckey].items() if k != "_key"})
            print(f"  {i}/{len(rows)} {r['report_id']} (from checkpoint)", file=sys.stderr, flush=True)
            continue
        t0 = time.perf_counter()
        try:
            res = engine.analyse(text)  # NOTE: only the report text is passed - never the label
        except Exception as exc:  # noqa: BLE001
            res = None
            err = str(exc)
        latency = int((time.perf_counter() - t0) * 1000)
        lab = labels[r["report_id"]]
        case = {
            "report_id": r["report_id"],
            "scenario_group": lab["scenario_group"],
            "ref": lab["assessment"],
            "ref_rules": [x for x in lab["rule_ids"].split(";") if x],
            "latency_ms": latency,
            "spans_total": 0,
            "spans_valid": 0,
            "invalid_removed": 0,
        }
        if res is None or not res.ok:
            case.update(pred=E, pred_rules=[], error=(res.error if res else err))
        else:
            out = res.output.model_dump()
            case.update(pred=res.output.assessment, pred_rules=sorted({t.rule_id for t in res.output.rule_tags}))
            for q in _all_quotes(out):
                case["spans_total"] += 1
                s, e = q.get("start"), q.get("end")
                if s is not None and e is not None and text[s:e] == q["quote"]:
                    case["spans_valid"] += 1
            case["invalid_removed"] = (res.validation or {}).get("quotes_invalid", 0)
        cases.append(case)
        if ckpt and case["pred"] != E:
            ckpt.parent.mkdir(parents=True, exist_ok=True)
            with open(ckpt, "a", encoding="utf-8") as fh:
                fh.write(json.dumps({**case, "_key": ckey}) + "\n")
        print(f"  {i}/{len(rows)} {r['report_id']} -> {case['pred']} ({latency} ms)", file=sys.stderr, flush=True)

    metrics = compute_metrics(cases, get_taxonomy().rule_ids)
    info = engine.info()
    result = {
        "label_provenance": LABEL_PROVENANCE,
        "dataset": str(dataset.relative_to(REPO)) if dataset.is_relative_to(REPO) else str(dataset),
        "split": split + (f" (sample: {per_group} per scenario group)" if per_group else "") + (f" (first {limit})" if limit else ""),
        "engine": engine_name,
        "engine_version": info.engine_version,
        "model": info.model,
        "prompt_version": info.prompt_version,
        "rubric_version": info.rubric_version,
        "taxonomy_version": info.taxonomy_version,
        "run_at": datetime.now(timezone.utc).isoformat(),
        "metrics": metrics,
        "errors": [c for c in cases if c["pred"] == E][:20],
        "disagreements": [
            {k: c[k] for k in ("report_id", "scenario_group", "ref", "pred", "ref_rules", "pred_rules")}
            for c in cases
            if c["pred"] != c["ref"] or set(c["pred_rules"]) != set(c["ref_rules"])
        ],
    }
    if store:
        _store(result, labels, rows)
    return result


def _store(result: dict, labels: dict[str, dict], rows: list[dict]) -> None:
    init_db()
    dataset = "synthetic-v1"
    with SessionLocal() as db:
        existing = {x.case_id for x in db.query(EvalReferenceLabel).filter(EvalReferenceLabel.dataset == dataset)}
        for lab in labels.values():
            if lab["report_id"] in existing:
                continue
            db.add(
                EvalReferenceLabel(
                    dataset=dataset,
                    case_id=lab["report_id"],
                    scenario_group=lab["scenario_group"],
                    split=lab["split"],
                    assessment=lab["assessment"],
                    rule_ids=[x for x in lab["rule_ids"].split(";") if x],
                    label_source=lab["label_source"],
                )
            )
        db.add(
            EvalRun(
                dataset=dataset,
                split=result["split"],
                engine=result["engine"],
                engine_version=result["engine_version"],
                model=result["model"],
                label_provenance=LABEL_PROVENANCE,
                n_cases=result["metrics"]["n"],
                metrics={**result["metrics"], "disagreements": result["disagreements"][:60], "errors": result["errors"]},
            )
        )
        db.commit()
    RESULTS.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    tag = result["split"].split(" ")[0] + ("_sample" if "sample" in result["split"] or "first" in result["split"] else "")
    name = f"{result['engine']}_{tag}_{stamp}"
    (RESULTS / f"{name}.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    (RESULTS / f"latest_{result['engine']}_{tag}.md").write_text(to_markdown(result), encoding="utf-8")


def to_markdown(res: dict) -> str:
    m = res["metrics"]
    cm = m["confusion_matrix"]
    lines = [
        f"# SafetyLens evaluation - {res['engine']} on `{res['split']}` split",
        "",
        f"> **{res['label_provenance']}**",
        "",
        f"- Engine: `{res['engine_version']}`  Model: `{res['model']}`  Prompt: `{res['prompt_version']}`",
        f"- Rubric: `{res['rubric_version']}`  Taxonomy: `{res['taxonomy_version']}`  Run: {res['run_at']}",
        f"- Cases: {m['n']}  Processing failures: {m['processing_failures']}",
        "",
        "## SIF potential",
        f"- Precision {m['sif']['precision']}, end-to-end recall {m['sif']['recall']}, F1 {m['sif']['f1']} "
        f"(recall on answered cases {m['sif']['recall_on_answered']})",
        f"- Capture of reference-SIF cases: {m['sif_capture']}",
        f"- Abstention rate {m['abstention']['abstention_rate']}, coverage {m['abstention']['coverage']}",
        f"- Three-class accuracy {m['three_class_accuracy']}",
        "",
        "| reference \\ output | SIF | NON_SIF | INSUFFICIENT | ERROR |",
        "|---|---|---|---|---|",
    ]
    for ref in (S, N, I):
        row = cm[ref]
        lines.append(f"| {ref} | {row[S]} | {row[N]} | {row[I]} | {row[E]} |")
    lines += [
        "",
        "## Life-Saving Rule tagging (multi-label)",
        f"- Micro P/R/F1: {m['rules']['micro']['precision']} / {m['rules']['micro']['recall']} / {m['rules']['micro']['f1']}; "
        f"macro F1 {m['rules']['macro_f1']}; exact tag-set match {m['rules']['exact_set_match_rate']}",
        "",
        "| rule | support | precision | recall | F1 |",
        "|---|---|---|---|---|",
    ]
    for rid, v in m["rules"]["per_rule"].items():
        lines.append(f"| {rid} | {v['support']} | {v['precision']} | {v['recall']} | {v['f1']} |")
    lines += [
        "",
        "## Evidence and latency",
        f"- Evidence spans checked {m['evidence']['quotes_checked']}, valid {m['evidence']['quotes_valid']} "
        f"(rate {m['evidence']['validity_rate']}); invalid quotes removed by validator: {m['evidence']['invalid_quotes_removed_by_validator']}",
        f"- Latency ms: mean {m['latency_ms']['mean']}, p50 {m['latency_ms']['p50']}, p95 {m['latency_ms']['p95']}",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--engine", choices=["baseline", "llm"], default="baseline")
    ap.add_argument("--split", choices=["dev", "test", "all"], default="test")
    ap.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--per-group", type=int, default=None, help="Evaluate at most N reports per scenario group (rate-limited APIs)")
    ap.add_argument("--no-store", action="store_true", help="Print only; do not save results or eval_runs rows")
    ap.add_argument("--no-resume", action="store_true", help="Ignore per-case checkpoints and re-run every case")
    args = ap.parse_args()
    try:
        res = run(args.engine, args.split, args.dataset, args.limit, store=not args.no_store, per_group=args.per_group, resume=not args.no_resume)
    except EngineUnavailable as exc:
        sys.exit(f"Engine unavailable: {exc}")
    print(to_markdown(res))
    if args.no_store:
        for d in res["disagreements"]:
            print(d)


if __name__ == "__main__":
    main()
