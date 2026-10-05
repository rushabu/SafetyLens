from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..ingestion.csv_import import TEMPLATE_CSV, CsvFormatError, parse_csv
from ..services import imports as svc
from .batches import batch_summary

router = APIRouter(prefix="/api", tags=["imports"])


async def _read(file: UploadFile) -> bytes:
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"File is larger than {get_settings().max_upload_mb} MB. Split it into smaller CSV files.")
    name = (file.filename or "").lower()
    if name and not name.endswith((".csv", ".txt")):
        raise HTTPException(415, "Only .csv files are supported. Export your spreadsheet as CSV (UTF-8).")
    return data


def _parse(data: bytes):  # noqa: ANN202
    try:
        return parse_csv(data, max_report_chars=get_settings().max_report_chars)
    except CsvFormatError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/imports/template.csv")
def template() -> Response:
    return Response(
        TEMPLATE_CSV,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="safetylens_template.csv"'},
    )


SAMPLES = {
    "synthetic_reports.csv": ("synthetic/synthetic_reports.csv", "171 synthetic reports covering all nine rules, other hazards and contrast pairs"),
    "sample_messy.csv": ("sample_messy.csv", "5 rows with deliberate problems (empty text, bad date, duplicate, extra column)"),
}


@router.get("/imports/samples")
def samples() -> list[dict]:
    from ..config import REPO_DIR

    return [
        {"name": k, "description": d, "available": (REPO_DIR / "data" / p).is_file()} for k, (p, d) in SAMPLES.items()
    ]


@router.get("/imports/samples/{name}")
def sample_file(name: str) -> Response:
    from ..config import REPO_DIR

    if name not in SAMPLES:
        raise HTTPException(404, "Unknown sample file")
    path = REPO_DIR / "data" / SAMPLES[name][0]
    if not path.is_file():
        raise HTTPException(404, "Sample not generated yet. Run: python -m seed.generate_synthetic")
    return Response(
        path.read_bytes(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}"'}
    )


@router.post("/imports/preview")
async def preview(file: UploadFile = File(...), db: Session = Depends(get_db)) -> dict:
    data = await _read(file)
    parsed = _parse(data)
    return svc.preview(parsed, db, file.filename)


@router.post("/imports/commit")
async def commit(
    file: UploadFile = File(...),
    source_type: Literal["operational", "synthetic"] = Form(...),
    engine: Literal["baseline", "llm"] = Form("baseline"),
    provenance: str | None = Form(None),
    batch_name: str | None = Form(None),
    force: bool = Form(False),
    db: Session = Depends(get_db),
) -> dict:
    data = await _read(file)
    parsed = _parse(data)
    if not parsed.rows:
        raise HTTPException(422, "No importable rows: every row was rejected. Fix the errors shown in the preview.")
    try:
        batch, created = svc.commit(
            parsed,
            db,
            filename=file.filename,
            source_type=source_type,
            provenance=provenance,
            engine=engine,
            batch_name=batch_name,
            force=force,
        )
    except svc.ImportRejected as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"created": created, "batch": batch_summary(db, batch)}


class ManualReport(BaseModel):
    report_text: str = Field(min_length=1)
    report_id: str | None = None
    site: str | None = None
    report_date: date | None = None
    report_type: str | None = None
    engine: Literal["baseline", "llm"] = "baseline"
    source_type: Literal["manual", "synthetic"] = "manual"


@router.post("/reports")
def create_report(body: ManualReport, db: Session = Depends(get_db)) -> dict:
    try:
        batch, rep = svc.create_manual(
            db,
            report_text=body.report_text,
            site=body.site,
            report_date=body.report_date,
            report_type=body.report_type,
            report_id=body.report_id,
            engine=body.engine,
            source_type=body.source_type,
        )
    except svc.ImportRejected as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"report_id": rep.id, "report_uid": rep.report_uid, "batch_id": batch.id}
