"""Evaluation reference labels must never reach the application's predictions."""
import re
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"


def test_app_code_never_reads_reference_labels():
    offenders = []
    for py in APP.rglob("*.py"):
        src = py.read_text(encoding="utf-8")
        if py.name == "models.py":
            continue  # the table definition lives here; nothing else may use it
        if re.search(r"reference_labels|EvalReferenceLabel|from eval|import eval", src):
            offenders.append(str(py.relative_to(APP)))
    assert offenders == []


def test_eval_runner_passes_only_report_text(monkeypatch, db_url):
    import eval.run_eval as ev
    from app.schemas.analysis import EngineInfo, EngineResult

    seen = []

    class Spy:
        engine_type = "baseline"

        def info(self):
            return EngineInfo(engine_type="baseline", engine_version="spy", rubric_version="r", taxonomy_version="t")

        def analyse(self, text):
            seen.append(text)
            return EngineResult(info=self.info(), error="spy")

    monkeypatch.setattr(ev, "get_engine", lambda name: Spy())
    res = ev.run("baseline", "test", ev.DEFAULT_DATASET, limit=5, store=False)
    reports, labels = ev.load_dataset(ev.DEFAULT_DATASET)
    texts = {r["report_id"]: r["report_text"] for r in reports}
    assert len(seen) == 5
    for t in seen:
        assert t in texts.values()
        for lab in ("SIF_POTENTIAL", "NON_SIF_POTENTIAL", "scenario_group"):
            assert lab not in t
    # Engine failures are counted as processing failures, not as a class.
    assert res["metrics"]["processing_failures"] == 5


def test_splits_keep_scenario_groups_together():
    import csv

    from eval.run_eval import DEFAULT_DATASET

    with open(DEFAULT_DATASET / "reference_labels.csv", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    by_group = {}
    for r in rows:
        by_group.setdefault(r["scenario_group"], set()).add(r["split"])
    assert all(len(s) == 1 for s in by_group.values())
    assert {"dev", "test"} == {next(iter(s)) for s in by_group.values()}
    # The uploadable file carries no labels.
    with open(DEFAULT_DATASET / "synthetic_reports.csv", encoding="utf-8") as fh:
        header = next(csv.reader(fh))
    assert "assessment" not in header and "rule_ids" not in header
