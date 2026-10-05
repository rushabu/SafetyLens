import pytest

from app.ingestion.csv_import import CsvFormatError, parse_csv
from tests.conftest import drain, upload

GOOD = (
    "report_id,report_text,site,report_date,report_type\n"
    'A1,"Rigger walked under the suspended load during the crane lift.",Site N,2026-01-05,Near Miss\n'
    'A2,"Worker slipped on oil on the walkway and grazed his hand; area was cleaned.",Site S,05/01/2026,Near Miss\n'
)


def test_missing_required_column_is_rejected():
    with pytest.raises(CsvFormatError, match="report_text"):
        parse_csv(b"report_id,site\n1,X\n")


def test_empty_file_and_binary_rejected():
    with pytest.raises(CsvFormatError):
        parse_csv(b"   ")
    with pytest.raises(CsvFormatError):
        parse_csv(b"report_text\n\x00\x01\x02")


def test_row_level_validation_and_unknowns():
    data = (
        "id,narrative,location,date,type,shift\n"
        "X1,Crane lift with rigger under the load.,North,2026-02-30,Near Miss,day\n"
        "X2,,South,2026-03-01,Unsafe Act,day\n"
        "X3,Crane lift with rigger under the load.,North,2026-03-02,Near Miss,night\n"
        ",Grinding near solvent drum without fire watch.,,,,\n"
    ).encode()
    p = parse_csv(data)
    assert p.mapping == {"id": "report_id", "narrative": "report_text", "location": "site", "date": "report_date", "type": "report_type"}
    assert p.ignored_columns == ["shift"]
    codes = {(i.row_number, i.code) for i in p.issues}
    assert (2, "empty_text") in codes
    assert (3, "duplicate_in_file") in codes  # case/whitespace-normalised exact duplicate
    assert (1, "unparsed_date") in codes
    rows = {r.row_number: r for r in p.rows}
    assert rows[1].report_date is None and rows[1].report_date_raw == "2026-02-30"
    assert rows[4].report_id is None and rows[4].site is None and rows[4].report_date is None
    assert rows[1].extra == {"shift": "day"}


def test_commit_generates_ids_is_idempotent_and_flags_duplicates(client):
    r = upload(client, GOOD)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] is True and body["batch"]["imported_rows"] == 2
    # Same file again -> same batch returned, nothing re-imported.
    r2 = upload(client, GOOD)
    assert r2.json()["created"] is False and r2.json()["batch"]["id"] == body["batch"]["id"]
    drain()
    # A different file containing one exact duplicate and one near-duplicate.
    other = (
        "report_text\n"
        '"Rigger walked under the suspended load during the crane lift."\n'
        '"Rigger walked under the suspended load during the crane lift today."\n'
    )
    prev = client.post("/api/imports/preview", files={"file": ("o.csv", other.encode(), "text/csv")}).json()
    codes = {i["code"] for i in prev["issues"]}
    assert {"duplicate_existing", "near_duplicate"} <= codes
    r3 = upload(client, other, name="o.csv")
    b = r3.json()["batch"]
    assert b["imported_rows"] == 1 and b["skipped_duplicates"] == 1 and b["near_duplicates"] == 1
    reports = client.get("/api/reports").json()["items"]
    gen = [x for x in reports if x["external_id"] is None]
    assert gen and all(x["uid"].startswith("SL-") for x in gen)
    assert any(x["near_duplicate"] for x in reports)


def test_invalid_upload_errors_are_actionable(client):
    r = client.post("/api/imports/preview", files={"file": ("x.csv", b"foo,bar\n1,2\n", "text/csv")})
    assert r.status_code == 422 and "report_text" in r.json()["detail"]
    r = client.post("/api/imports/preview", files={"file": ("x.xlsx", b"PK\x03\x04", "application/octet-stream")})
    assert r.status_code == 415
    r = client.get("/api/imports/template.csv")
    assert r.status_code == 200 and r.text.startswith("report_id,report_text,site,report_date,report_type")
