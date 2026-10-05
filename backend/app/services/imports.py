"""Database-aware import: duplicate checks, idempotent commit, manual entry, job creation."""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from rapidfuzz import fuzz, process
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..analysis.registry import EngineUnavailable, data_policy_violation, get_engine
from ..config import get_settings
from ..ingestion.csv_import import ParsedFile, RowIssue, normalise_text, text_hash
from ..models import AnalysisJob, Batch, ImportRowIssue, Report


class ImportRejected(ValueError):
    pass


def new_uid() -> str:
    return f"SL-{uuid.uuid4().hex[:10].upper()}"


@dataclass
class DupInfo:
    exact_existing: dict[int, str]  # row_number -> existing report uid
    near: dict[int, tuple[str, float]]  # row_number -> (matched report uid or 'row N', score)


@dataclass
class _Cand:
    label: str  # report uid or "row N"
    text: str  # normalised
    site: str | None
    report_date: date | None


def _compatible(a_site, a_date, b: _Cand) -> bool:  # noqa: ANN001
    """A probable duplicate must plausibly describe the same event: known sites must match and
    known dates must be within a week. Unknown values never rule a match out."""
    if a_site and b.site and a_site.strip().lower() != b.site.strip().lower():
        return False
    if a_date and b.report_date and abs((a_date - b.report_date).days) > 7:
        return False
    return True


def find_duplicates(parsed: ParsedFile, db: Session) -> DupInfo:
    threshold = get_settings().near_duplicate_threshold
    rows = db.execute(select(Report.text_hash, Report.report_uid, Report.report_text, Report.site, Report.report_date)).all()
    by_hash = {h: uid for h, uid, *_ in rows}
    corpus = [_Cand(uid, normalise_text(t), s, d) for _, uid, t, s, d in rows]
    exact: dict[int, str] = {}
    near: dict[int, tuple[str, float]] = {}
    for r in parsed.rows:
        if r.text_hash in by_hash:
            exact[r.row_number] = by_hash[r.text_hash]
            continue
        norm = normalise_text(r.report_text)
        best: tuple[str, float] | None = None
        if corpus:
            matches = process.extract(
                norm, [c.text for c in corpus], scorer=fuzz.token_sort_ratio, score_cutoff=threshold, limit=10
            )
            for _, score, idx in matches:
                if _compatible(r.site, r.report_date, corpus[idx]) and (best is None or score > best[1]):
                    best = (corpus[idx].label, float(score))
        if best:
            near[r.row_number] = best
        corpus.append(_Cand(f"row {r.row_number}", norm, r.site, r.report_date))
    return DupInfo(exact, near)


def preview(parsed: ParsedFile, db: Session, filename: str | None) -> dict:
    dups = find_duplicates(parsed, db)
    existing_batch = db.execute(select(Batch).where(Batch.file_sha256 == parsed.file_sha256)).scalars().first()
    issues = [i.__dict__ for i in parsed.issues]
    for rn, uid in dups.exact_existing.items():
        issues.append(
            {"row_number": rn, "severity": "skipped", "code": "duplicate_existing", "message": f"Exact duplicate of stored report {uid}", "raw": None}
        )
    for rn, (ref, score) in dups.near.items():
        issues.append(
            {"row_number": rn, "severity": "warning", "code": "near_duplicate", "message": f"Probable near-duplicate of {ref} (similarity {score:.0f}/100) - will be imported and flagged", "raw": None}
        )
    issues.sort(key=lambda x: (x["row_number"], x["severity"]))
    importable = [r for r in parsed.rows if r.row_number not in dups.exact_existing]
    row_sources = {r.source_type for r in parsed.rows if r.source_type}
    suggested = "synthetic" if ("synthetic" in row_sources or (filename and "synthetic" in filename.lower())) else "operational"
    return {
        "filename": filename,
        "file_sha256": parsed.file_sha256,
        "columns": parsed.columns,
        "mapping": parsed.mapping,
        "ignored_columns": parsed.ignored_columns,
        "missing_optional_columns": parsed.missing_optional,
        "total_rows": parsed.total_rows,
        "valid_rows": len(parsed.rows),
        "importable_rows": len(importable),
        "error_rows": sum(1 for i in parsed.issues if i.severity == "error"),
        "duplicate_rows": sum(1 for i in parsed.issues if i.code == "duplicate_in_file") + len(dups.exact_existing),
        "near_duplicate_rows": len(dups.near),
        "row_source_types": sorted(row_sources),
        "suggested_source_type": suggested,
        "issues": issues[:500],
        "sample_rows": [
            {
                "row_number": r.row_number,
                "report_id": r.report_id,
                "report_text": r.report_text[:300],
                "site": r.site,
                "report_date": r.report_date.isoformat() if r.report_date else None,
                "report_type": r.report_type,
                "source_type": r.source_type,
                "near_duplicate": r.row_number in dups.near,
            }
            for r in importable[:15]
        ],
        "already_imported_batch": (
            {"id": existing_batch.id, "name": existing_batch.name, "created_at": existing_batch.created_at.isoformat() + "Z"}
            if existing_batch
            else None
        ),
    }


def _check_engine(engine: str, source_types: set[str]) -> None:
    try:
        get_engine(engine)
    except EngineUnavailable as exc:
        raise ImportRejected(str(exc)) from exc
    msg = data_policy_violation(engine, source_types)
    if msg:
        raise ImportRejected(msg)


def commit(
    parsed: ParsedFile,
    db: Session,
    *,
    filename: str | None,
    source_type: str,
    provenance: str | None,
    engine: str,
    batch_name: str | None = None,
    force: bool = False,
) -> tuple[Batch, bool]:
    """Import rows and queue analysis jobs. Returns (batch, created). Idempotent on file hash."""
    if source_type not in ("operational", "synthetic"):
        raise ImportRejected("source_type must be 'operational' or 'synthetic'")
    if not force:
        existing = db.execute(select(Batch).where(Batch.file_sha256 == parsed.file_sha256)).scalars().first()
        if existing:
            return existing, False
    row_sources = {r.source_type or source_type for r in parsed.rows}
    _check_engine(engine, row_sources)

    dups = find_duplicates(parsed, db)
    uid_to_id = dict(db.execute(select(Report.report_uid, Report.id)).all())
    batch = Batch(
        name=batch_name or (filename or "CSV import"),
        kind="csv",
        filename=filename,
        file_sha256=parsed.file_sha256,
        source_type=source_type,
        provenance=provenance,
        engine=engine,
        status="queued",
        total_rows=parsed.total_rows,
    )
    db.add(batch)
    db.flush()

    issues: list[RowIssue] = list(parsed.issues)
    created: dict[str, Report] = {}
    for r in parsed.rows:
        if r.row_number in dups.exact_existing:
            issues.append(RowIssue(r.row_number, "skipped", "duplicate_existing", f"Exact duplicate of stored report {dups.exact_existing[r.row_number]}"))
            continue
        rep = Report(
            report_uid=new_uid(),
            external_report_id=r.report_id,
            batch_id=batch.id,
            row_number=r.row_number,
            report_text=r.report_text,
            text_hash=r.text_hash,
            site=r.site,
            report_date=r.report_date,
            report_date_raw=r.report_date_raw,
            report_type=r.report_type,
            source_type=r.source_type or source_type,
            provenance=r.provenance or provenance,
            extra_fields=r.extra or None,
        )
        near = dups.near.get(r.row_number)
        if near:
            ref, score = near
            target = uid_to_id.get(ref)
            if target is None and ref.startswith("row "):
                tgt = created.get(ref)
                target = tgt.id if tgt else None
            rep.near_duplicate_of_id = target
            rep.near_duplicate_score = score
        db.add(rep)
        db.flush()
        created[f"row {r.row_number}"] = rep
        db.add(AnalysisJob(batch_id=batch.id, report_id=rep.id, engine=engine, status="queued"))

    for i in issues:
        db.add(ImportRowIssue(batch_id=batch.id, row_number=i.row_number, severity=i.severity, code=i.code, message=i.message, raw=i.raw))
    batch.imported_rows = len(created)
    batch.skipped_duplicates = sum(1 for i in issues if i.severity == "skipped")
    batch.rejected_rows = sum(1 for i in issues if i.severity == "error")
    batch.near_duplicates = sum(1 for rep in created.values() if rep.near_duplicate_score is not None)
    batch.status = "queued" if created else "completed"
    db.commit()
    return batch, True


def create_manual(
    db: Session,
    *,
    report_text: str,
    site: str | None,
    report_date,  # noqa: ANN001
    report_type: str | None,
    report_id: str | None,
    engine: str,
    source_type: str = "manual",
) -> tuple[Batch, Report]:
    body = (report_text or "").strip()
    if not body:
        raise ImportRejected("Report text is required.")
    if len(body) > get_settings().max_report_chars:
        raise ImportRejected(f"Report text exceeds {get_settings().max_report_chars} characters.")
    h = text_hash(body)
    dup = db.execute(select(Report).where(Report.text_hash == h)).scalars().first()
    if dup:
        raise ImportRejected(f"An identical report already exists ({dup.report_uid}). Open it instead of re-submitting.")
    _check_engine(engine, {source_type})
    batch = Batch(name="Manual entry", kind="manual", source_type=source_type, engine=engine, status="queued", total_rows=1, imported_rows=1)
    db.add(batch)
    db.flush()
    rep = Report(
        report_uid=new_uid(),
        external_report_id=(report_id or "").strip() or None,
        batch_id=batch.id,
        row_number=1,
        report_text=body,
        text_hash=h,
        site=(site or "").strip() or None,
        report_date=report_date,
        report_type=(report_type or "").strip() or None,
        source_type=source_type,
        provenance="Entered manually via SafetyLens UI",
    )
    db.add(rep)
    db.flush()
    db.add(AnalysisJob(batch_id=batch.id, report_id=rep.id, engine=engine, status="queued"))
    db.commit()
    return batch, rep
