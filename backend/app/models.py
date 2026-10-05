"""SQLAlchemy ORM models.

Design rules:
- Original report text is never modified.
- Analyses are versioned: re-analysis inserts a new row and moves `is_current`.
- Reviews are append-only; they never mutate analyses.
- Evaluation reference labels live in their own table and are never read by analysis code.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20), default="csv")  # csv | manual
    filename: Mapped[str | None] = mapped_column(String(300))
    file_sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    source_type: Mapped[str] = mapped_column(String(20))  # operational | synthetic | manual
    provenance: Mapped[str | None] = mapped_column(Text)
    engine: Mapped[str] = mapped_column(String(20))  # baseline | llm
    status: Mapped[str] = mapped_column(String(30), default="queued")
    total_rows: Mapped[int] = mapped_column(Integer, default=0)
    imported_rows: Mapped[int] = mapped_column(Integer, default=0)
    skipped_duplicates: Mapped[int] = mapped_column(Integer, default=0)
    rejected_rows: Mapped[int] = mapped_column(Integer, default=0)
    near_duplicates: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    reports: Mapped[list[Report]] = relationship(back_populates="batch")
    row_issues: Mapped[list[ImportRowIssue]] = relationship(back_populates="batch", cascade="all, delete-orphan")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_uid: Mapped[str] = mapped_column(String(40), unique=True)  # internal stable ID, e.g. SL-000123
    external_report_id: Mapped[str | None] = mapped_column(String(100), index=True)
    batch_id: Mapped[int | None] = mapped_column(ForeignKey("batches.id"), index=True)
    row_number: Mapped[int | None] = mapped_column(Integer)
    report_text: Mapped[str] = mapped_column(Text)
    text_hash: Mapped[str] = mapped_column(String(64), index=True)
    site: Mapped[str | None] = mapped_column(String(200), index=True)
    report_date: Mapped[date | None] = mapped_column(Date, index=True)
    report_date_raw: Mapped[str | None] = mapped_column(String(100))
    report_type: Mapped[str | None] = mapped_column(String(100))
    source_type: Mapped[str] = mapped_column(String(20), index=True)
    provenance: Mapped[str | None] = mapped_column(Text)
    near_duplicate_of_id: Mapped[int | None] = mapped_column(ForeignKey("reports.id"))
    near_duplicate_score: Mapped[float | None] = mapped_column(Float)
    extra_fields: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    batch: Mapped[Batch | None] = relationship(back_populates="reports")
    analyses: Mapped[list[Analysis]] = relationship(
        back_populates="report", order_by="Analysis.id", cascade="all, delete-orphan"
    )
    reviews: Mapped[list[Review]] = relationship(back_populates="report", order_by="Review.id")


class ImportRowIssue(Base):
    """Rows rejected or skipped during import, kept for explicit failed-row handling."""

    __tablename__ = "import_row_issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"), index=True)
    row_number: Mapped[int] = mapped_column(Integer)
    severity: Mapped[str] = mapped_column(String(20))  # error | skipped | warning
    code: Mapped[str] = mapped_column(String(50))
    message: Mapped[str] = mapped_column(Text)
    raw: Mapped[dict | None] = mapped_column(JSON)

    batch: Mapped[Batch] = relationship(back_populates="row_issues")


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int | None] = mapped_column(ForeignKey("batches.id"), index=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id"), index=True)
    engine: Mapped[str] = mapped_column(String(20))
    # queued | running | done | failed | interrupted
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    analysis_id: Mapped[int | None] = mapped_column(ForeignKey("analyses.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime)


class Analysis(Base):
    __tablename__ = "analyses"
    __table_args__ = (Index("ix_analyses_report_current", "report_id", "is_current"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id"), index=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    engine_type: Mapped[str] = mapped_column(String(20))  # baseline | llm
    engine_version: Mapped[str] = mapped_column(String(60))
    model: Mapped[str | None] = mapped_column(String(120))
    prompt_version: Mapped[str | None] = mapped_column(String(60))
    rubric_version: Mapped[str] = mapped_column(String(60))
    taxonomy_version: Mapped[str] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(30))  # COMPLETED | PROCESSING_ERROR
    assessment: Mapped[str | None] = mapped_column(String(40), index=True)
    rationale: Mapped[str | None] = mapped_column(Text)
    event_modality: Mapped[str | None] = mapped_column(String(20))
    evidence_sufficiency: Mapped[str | None] = mapped_column(String(20))
    activity_category: Mapped[str | None] = mapped_column(String(60), index=True)
    exposure_status: Mapped[str | None] = mapped_column(String(20))
    output: Mapped[dict | None] = mapped_column(JSON)  # validated AnalysisOutput
    raw_output: Mapped[str | None] = mapped_column(Text)  # provider text (LLM) for audit
    validation: Mapped[dict | None] = mapped_column(JSON)  # validation report
    flags: Mapped[list | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    report: Mapped[Report] = relationship(back_populates="analyses")
    facts: Mapped[list[ExtractedFact]] = relationship(back_populates="analysis", cascade="all, delete-orphan")
    rule_tags: Mapped[list[RuleTag]] = relationship(back_populates="analysis", cascade="all, delete-orphan")
    spans: Mapped[list[EvidenceSpan]] = relationship(back_populates="analysis", cascade="all, delete-orphan")


class ExtractedFact(Base):
    __tablename__ = "extracted_facts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    analysis_id: Mapped[int] = mapped_column(ForeignKey("analyses.id"), index=True)
    # activity | hazard | exposure | barrier | consequence | other_hazard | missing_info
    fact_type: Mapped[str] = mapped_column(String(30), index=True)
    category: Mapped[str | None] = mapped_column(String(60), index=True)  # normalised value
    value: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(String(20))  # barrier: failed|effective|unknown; exposure status
    critical: Mapped[bool | None] = mapped_column(Boolean)

    analysis: Mapped[Analysis] = relationship(back_populates="facts")


class RuleTag(Base):
    __tablename__ = "rule_tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    analysis_id: Mapped[int] = mapped_column(ForeignKey("analyses.id"), index=True)
    rule_id: Mapped[str] = mapped_column(String(10), index=True)
    relevance: Mapped[str] = mapped_column(String(20))  # primary | secondary
    status: Mapped[str] = mapped_column(String(20))  # breach | control | unclear
    explanation: Mapped[str | None] = mapped_column(Text)

    analysis: Mapped[Analysis] = relationship(back_populates="rule_tags")


class EvidenceSpan(Base):
    __tablename__ = "evidence_spans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    analysis_id: Mapped[int] = mapped_column(ForeignKey("analyses.id"), index=True)
    owner_type: Mapped[str] = mapped_column(String(30))  # hazard | exposure | barrier | rule_tag | ...
    owner_key: Mapped[str] = mapped_column(String(80))  # category / rule_id
    start: Mapped[int] = mapped_column(Integer)
    end: Mapped[int] = mapped_column(Integer)
    quote: Mapped[str] = mapped_column(Text)
    repaired: Mapped[bool] = mapped_column(Boolean, default=False)

    analysis: Mapped[Analysis] = relationship(back_populates="spans")


class Review(Base):
    """Append-only reviewer decision. Never updated or deleted by the application."""

    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id"), index=True)
    analysis_id: Mapped[int | None] = mapped_column(ForeignKey("analyses.id"))
    reviewer: Mapped[str] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(20))  # confirm | correct
    assessment: Mapped[str] = mapped_column(String(40))
    rule_tags: Mapped[list] = mapped_column(JSON)  # [{rule_id, status}]
    model_assessment: Mapped[str | None] = mapped_column(String(40))  # snapshot of what was reviewed
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    report: Mapped[Report] = relationship(back_populates="reviews")


class EvalReferenceLabel(Base):
    """Evaluation-only reference labels. MUST NOT be imported by app.analysis or used in prompts."""

    __tablename__ = "eval_reference_labels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dataset: Mapped[str] = mapped_column(String(100), index=True)
    case_id: Mapped[str] = mapped_column(String(100))
    scenario_group: Mapped[str] = mapped_column(String(100))
    split: Mapped[str] = mapped_column(String(20))
    assessment: Mapped[str] = mapped_column(String(40))
    rule_ids: Mapped[list] = mapped_column(JSON)
    label_source: Mapped[str] = mapped_column(String(200))


class EvalRun(Base):
    __tablename__ = "eval_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dataset: Mapped[str] = mapped_column(String(100))
    split: Mapped[str] = mapped_column(String(20))
    engine: Mapped[str] = mapped_column(String(20))
    engine_version: Mapped[str] = mapped_column(String(60))
    model: Mapped[str | None] = mapped_column(String(120))
    label_provenance: Mapped[str] = mapped_column(Text)
    n_cases: Mapped[int] = mapped_column(Integer)
    metrics: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
