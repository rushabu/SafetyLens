"""CSV parsing and row-level validation (no database access).

Only `report_text` is mandatory. `report_id`, `site`, `report_date`, `report_type` are optional;
missing values are kept as unknown (None) - never invented. Optional `source_type` /
`provenance` columns are respected per row so synthetic data stays labelled.
"""
from __future__ import annotations

import hashlib
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime

import pandas as pd

REQUIRED = "report_text"
STANDARD_COLUMNS = ["report_id", "report_text", "site", "report_date", "report_type"]
OPTIONAL_META = ["source_type", "provenance"]
ALIASES = {
    "id": "report_id",
    "reportid": "report_id",
    "report_no": "report_id",
    "report_number": "report_id",
    "text": "report_text",
    "description": "report_text",
    "narrative": "report_text",
    "report": "report_text",
    "observation": "report_text",
    "location": "site",
    "site_name": "site",
    "date": "report_date",
    "event_date": "report_date",
    "type": "report_type",
    "category": "report_type",
}
DATE_FORMATS = [
    "%Y-%m-%d",
    "%Y/%m/%d",
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%d.%m.%Y",
    "%d %b %Y",
    "%d %B %Y",
    "%b %d %Y",
    "%B %d %Y",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%d/%m/%Y %H:%M",
]
SOURCE_TYPES = {"operational", "synthetic", "manual"}
_WS = re.compile(r"\s+")


class CsvFormatError(ValueError):
    """The file cannot be processed at all (wrong format / missing required column)."""


@dataclass
class RowIssue:
    row_number: int  # 1-based data row number (header excluded)
    severity: str  # error | skipped | warning
    code: str
    message: str
    raw: dict | None = None


@dataclass
class ParsedRow:
    row_number: int
    report_id: str | None
    report_text: str
    text_hash: str
    site: str | None
    report_date: date | None
    report_date_raw: str | None
    report_type: str | None
    source_type: str | None
    provenance: str | None
    extra: dict


@dataclass
class ParsedFile:
    file_sha256: str
    columns: list[str]
    mapping: dict[str, str]  # original -> standard
    ignored_columns: list[str]
    missing_optional: list[str]
    total_rows: int
    rows: list[ParsedRow] = field(default_factory=list)
    issues: list[RowIssue] = field(default_factory=list)


def normalise_text(text: str) -> str:
    return _WS.sub(" ", text).strip().lower()


def text_hash(text: str) -> str:
    return hashlib.sha256(normalise_text(text).encode("utf-8")).hexdigest()


def parse_date(raw: str) -> date | None:
    raw = raw.strip()
    if not raw:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _decode(data: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    raise CsvFormatError("Could not decode the file. Save it as UTF-8 CSV and try again.")


def _clean(v: object) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def parse_csv(data: bytes, *, max_report_chars: int = 10000) -> ParsedFile:
    if not data or not data.strip():
        raise CsvFormatError("The file is empty.")
    sha = hashlib.sha256(data).hexdigest()
    text = _decode(data)
    if "\x00" in text:
        raise CsvFormatError("This looks like a binary file, not a CSV. Export the sheet as CSV (UTF-8).")
    try:
        df = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False, skip_blank_lines=True)
    except pd.errors.ParserError as exc:
        raise CsvFormatError(f"The CSV could not be parsed: {exc}. Check quoting of text that contains commas or line breaks.") from exc
    except pd.errors.EmptyDataError as exc:
        raise CsvFormatError("The file has no header row.") from exc

    original_cols = [str(c) for c in df.columns]
    mapping: dict[str, str] = {}
    used: set[str] = set()
    for c in original_cols:
        key = re.sub(r"[^a-z0-9]+", "_", c.strip().lower()).strip("_")
        std = key if key in STANDARD_COLUMNS + OPTIONAL_META else ALIASES.get(key)
        if std and std not in used:
            mapping[c] = std
            used.add(std)
    if REQUIRED not in used:
        raise CsvFormatError(
            "Missing required column 'report_text'. Found columns: "
            + (", ".join(original_cols) or "none")
            + ". Download the template to see the expected format."
        )
    ignored = [c for c in original_cols if c not in mapping]
    missing_optional = [c for c in STANDARD_COLUMNS if c not in used and c != REQUIRED]
    df = df.rename(columns=mapping)

    parsed = ParsedFile(
        file_sha256=sha,
        columns=original_cols,
        mapping=mapping,
        ignored_columns=ignored,
        missing_optional=missing_optional,
        total_rows=len(df),
    )
    seen_hash: dict[str, int] = {}
    for i, rec in enumerate(df.to_dict(orient="records"), start=1):
        raw = {k: v for k, v in rec.items()}
        body = _clean(rec.get("report_text"))
        if body is None:
            parsed.issues.append(RowIssue(i, "error", "empty_text", "report_text is empty - row cannot be analysed", raw))
            continue
        if len(body) > max_report_chars:
            parsed.issues.append(
                RowIssue(i, "error", "text_too_long", f"report_text has {len(body)} characters (limit {max_report_chars})", raw)
            )
            continue
        h = text_hash(body)
        if h in seen_hash:
            parsed.issues.append(
                RowIssue(i, "skipped", "duplicate_in_file", f"Exact duplicate of row {seen_hash[h]} in this file", raw)
            )
            continue
        seen_hash[h] = i
        date_raw = _clean(rec.get("report_date"))
        d = parse_date(date_raw) if date_raw else None
        if date_raw and d is None:
            parsed.issues.append(
                RowIssue(i, "warning", "unparsed_date", f"Date '{date_raw}' not recognised - stored as unknown", None)
            )
        st = (_clean(rec.get("source_type")) or "").lower() or None
        if st is not None and st not in SOURCE_TYPES:
            parsed.issues.append(
                RowIssue(i, "warning", "unknown_source_type", f"source_type '{st}' not recognised - batch default used", None)
            )
            st = None
        extra = {k: v for k, v in rec.items() if k not in STANDARD_COLUMNS + OPTIONAL_META and str(v).strip()}
        parsed.rows.append(
            ParsedRow(
                row_number=i,
                report_id=_clean(rec.get("report_id")),
                report_text=body,
                text_hash=h,
                site=_clean(rec.get("site")),
                report_date=d,
                report_date_raw=date_raw,
                report_type=_clean(rec.get("report_type")),
                source_type=st,
                provenance=_clean(rec.get("provenance")),
                extra=extra,
            )
        )
    return parsed


TEMPLATE_CSV = (
    "report_id,report_text,site,report_date,report_type\n"
    'EX-001,"During the crane lift of a pipe spool, a rigger walked under the suspended load to guide it. '
    'No injury.",Synthetic Site North,2026-03-14,Near Miss\n'
    'EX-002,"Pre-use inspection found a frayed sling; it was quarantined and removed from service before use.",'
    "Synthetic Site South,2026-03-15,Unsafe Condition\n"
    'EX-003,"Housekeeping poor near store.",,,Unsafe Condition\n'
)
