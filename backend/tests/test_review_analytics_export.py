"""Review history, analytics denominators/filters, patterns, exports and worker recovery."""
import csv
import io

from sqlalchemy import select

from app.models import Analysis, AnalysisJob, Batch, Review
from tests.conftest import drain, upload

OPS = (
    "report_id,report_text,site,report_date,report_type\n"
    'O1,"During the crane lift a rigger walked under the suspended load. No exclusion zone was set up.",North,2026-01-10,Near Miss\n'
    'O2,"Observed a fitter standing directly beneath a pipe spool being lifted by the crane. No barricade was in place.",North,2026-01-20,Near Miss\n'
    'O3,"Pre-use inspection found a frayed sling. It was quarantined and removed from service before the lift.",North,2026-02-03,Unsafe Condition\n'
    'O4,"Unsafe condition near tank area.",South,2026-02-10,Unsafe Condition\n'
    'O5,"Worker slipped on oil on the walkway and grazed his hand; the area was cleaned.",South,,Near Miss\n'
    'O6,"=HYPERLINK(""http://x"") The mechanic was cleaning the conveyor when it started unexpectedly. Isolation had not been applied.",,2026-02-15,Near Miss\n'
)
SYN = "report_text\nScaffolder working at 8 m on the scaffold was not wearing a harness.\n"


def seed(client):
    assert upload(client, OPS).status_code == 200
    assert upload(client, SYN, source_type="synthetic", name="synthetic.csv").status_code == 200
    drain()


def test_analytics_denominators_filters_and_synthetic_exclusion(client, session):
    seed(client)
    ov = client.get("/api/analytics/overview").json()
    s = ov["summary"]
    # Operational only by default (synthetic excluded).
    assert s["reporting_volume"] == 6
    assert s["sif"] + s["non_sif"] == s["determinate"]
    assert s["density"] == round(s["sif"] / s["determinate"], 4)
    assert s["insufficient"] >= 1  # "Unsafe condition near tank area."
    assert s["small_sample"] is True
    # Counts match stored current analyses.
    stored = session.execute(select(Analysis.assessment).where(Analysis.is_current.is_(True))).scalars().all()
    assert len(stored) == 7  # incl. synthetic
    assert s["sif"] == 3 and stored.count("SIF_POTENTIAL") == 4
    # Synthetic included when asked.
    s2 = client.get("/api/analytics/overview", params=[("source_type", "operational"), ("source_type", "synthetic")]).json()["summary"]
    assert s2["reporting_volume"] == 7 and s2["sif"] == 4
    # Site filter applies to every chart and table consistently.
    north = client.get("/api/analytics/overview", params={"site": "North"}).json()
    assert north["summary"]["reporting_volume"] == 3
    assert [r["key"] for r in north["by_site"]] == ["North"]
    assert client.get("/api/reports", params={"site": "North"}).json()["total"] == 3
    # Unknown site is grouped explicitly; dates outside range excluded (undated rows excluded by date filter).
    keys = {r["key"] for r in ov["by_site"]}
    assert "Unknown site" in keys
    feb = client.get("/api/analytics/overview", params={"date_from": "2026-02-01", "date_to": "2026-02-28"}).json()
    assert feb["summary"]["reporting_volume"] == 3
    # Multi-label note present.
    assert "exceed" in ov["rules"]["note"]


def test_review_history_is_append_only_and_preserves_model_output(client, session):
    seed(client)
    item = client.get("/api/reports", params={"q": "frayed sling"}).json()["items"][0]
    detail = client.get(f"/api/reports/{item['id']}").json()
    aid = detail["analysis"]["id"]
    original = detail["analysis"]["assessment"]
    tags = [{"rule_id": t["rule_id"], "status": t["status"]} for t in detail["analysis"]["output"]["rule_tags"]]

    r1 = client.post(f"/api/reports/{item['id']}/reviews", json={"reviewer": "A. Reviewer", "assessment": original, "rule_tags": tags, "analysis_id": aid})
    assert r1.status_code == 200 and r1.json()["action"] == "confirm"
    r2 = client.post(
        f"/api/reports/{item['id']}/reviews",
        json={"reviewer": "B. Reviewer", "assessment": "INSUFFICIENT_INFORMATION", "rule_tags": [], "notes": "need lift details", "analysis_id": aid},
    )
    assert r2.status_code == 200 and r2.json()["action"] == "correct"
    assert client.post(f"/api/reports/{item['id']}/reviews", json={"reviewer": " ", "assessment": original}).status_code in (400, 422)

    hist = client.get(f"/api/reports/{item['id']}/reviews").json()
    assert [h["reviewer"] for h in hist] == ["B. Reviewer", "A. Reviewer"]  # newest first, nothing overwritten
    assert hist[0]["model_assessment"] == original
    session.expire_all()
    a = session.get(Analysis, aid)
    assert a.assessment == original  # model output untouched
    assert session.execute(select(Review)).scalars().all().__len__() == 2

    # Reviewed view uses the latest review only and reports the backlog separately.
    rv = client.get("/api/analytics/overview", params={"view": "reviewed"}).json()["summary"]
    assert rv["reviewed"] == 1 and rv["insufficient"] == 1 and rv["unreviewed"] == 5

    # Re-analysis creates a new version; reviewing the stale version is refused.
    client.post(f"/api/reports/{item['id']}/reanalyse", json={"engine": "baseline"})
    drain()
    d2 = client.get(f"/api/reports/{item['id']}").json()
    assert len(d2["analyses"]) == 2 and d2["analysis"]["id"] != aid
    stale = client.post(f"/api/reports/{item['id']}/reviews", json={"reviewer": "C", "assessment": original, "analysis_id": aid})
    assert stale.status_code == 409


def test_patterns_link_to_real_reports(client):
    seed(client)
    pats = client.get("/api/patterns").json()["patterns"]
    assert pats, "expected at least one recurring pattern"
    ids = {x["id"] for x in client.get("/api/reports", params={"page_size": 200}).json()["items"]}
    for p in pats:
        assert p["report_count"] >= 2 and len(p["reports"]) == p["report_count"]
        for r in p["reports"]:
            assert r["id"] in ids
            assert client.get(f"/api/reports/{r['id']}").status_code == 200
    top = pats[0]
    assert top["activity"] == "lifting" and top["barrier"] == "exclusion_zone"


def test_csv_export_respects_filters_and_neutralises_formulas(client):
    seed(client)
    r = client.get("/api/export/reports.csv", params={"site": "North"})
    assert r.status_code == 200
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert len(rows) == 3 and {x["site"] for x in rows} == {"North"}
    for col in ("safetylens_id", "model_assessment", "rule_tags", "failed_barriers", "rubric_version", "source_type", "report_text"):
        assert col in rows[0]
    all_rows = list(csv.DictReader(io.StringIO(client.get("/api/export/reports.csv").text)))
    assert len(all_rows) == 6
    inj = next(x for x in all_rows if "HYPERLINK" in x["report_text"])
    assert inj["report_text"].startswith("'=")
    syn = list(csv.DictReader(io.StringIO(client.get("/api/export/reports.csv", params={"source_type": "synthetic"}).text)))
    assert len(syn) == 1 and syn[0]["source_type"] == "synthetic"


def test_interrupted_jobs_recover_to_retryable_state(client, session):
    from app.worker import process_one, recover_interrupted

    upload(client, OPS)
    assert process_one()  # one job completes
    job = session.execute(select(AnalysisJob).where(AnalysisJob.status == "queued")).scalars().first()
    job.status = "running"  # simulate a crash mid-job
    session.commit()
    assert recover_interrupted() == 1
    drain()  # never-started jobs continue; the interrupted one waits for an explicit resume
    session.expire_all()
    batch = session.execute(select(Batch)).scalars().first()
    assert session.get(AnalysisJob, job.id).status == "interrupted"
    assert batch.status == "interrupted"
    done_before = session.execute(select(AnalysisJob).where(AnalysisJob.status == "done")).scalars().all()
    r = client.post(f"/api/batches/{batch.id}/resume")
    assert r.json()["requeued"] == 1
    drain()
    session.expire_all()
    assert session.get(Batch, batch.id).status == "completed"
    # The job completed before the crash was not re-run (still exactly one analysis for its report).
    for j in done_before:
        n = session.execute(select(Analysis).where(Analysis.report_id == j.report_id)).scalars().all()
        assert len(n) == 1


def test_density_ranking_excludes_small_samples_and_has_intervals(client):
    from app.services.analytics import wilson

    lo, hi = wilson(3, 10)
    assert lo is not None and lo < 0.3 < hi
    assert wilson(0, 0) == (None, None)
    seed(client)
    ov = client.get("/api/analytics/overview").json()
    for row in ov["by_site"] + ov["by_activity"]:
        if row["small_sample"]:
            assert row["density_rank"] is None  # listed, never ranked
        if row["determinate"]:
            assert row["density_low"] <= row["density"] <= row["density_high"]
    # Focus areas only contain combinations with SIF-flagged reports, sorted by SIF count.
    fa = ov["focus_areas"]
    assert fa and all(x["sif"] > 0 for x in fa)
    assert [x["sif"] for x in fa] == sorted([x["sif"] for x in fa], reverse=True)


def test_location_patterns_and_triage_sort(client):
    seed(client)
    pats = client.get("/api/patterns", params={"group_by": "site_activity_barrier"}).json()
    assert pats["meta"]["dimensions"] == ["site", "activity", "barrier"]
    assert pats["patterns"] and all(p["site"] for p in pats["patterns"])
    north = [p for p in pats["patterns"] if p["site"] == "North"]
    assert north and all(r["site"] == "North" for p in north for r in p["reports"])
    items = client.get("/api/reports", params={"sort": "triage"}).json()["items"]
    order = [i["status"] for i in items]
    assert order[0] == "SIF_POTENTIAL" and order.index("NON_SIF_POTENTIAL") > order.index("INSUFFICIENT_INFORMATION")
