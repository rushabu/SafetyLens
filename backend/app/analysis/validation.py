"""Validation of engine output against the taxonomy and against the ORIGINAL report text.

- Every evidence quote must exist in the report. If the offsets are wrong but the quote is
  found, offsets are repaired (and flagged). If the quote cannot be found, it is removed and
  counted as invalid - it is never displayed as support.
- Category / rule IDs must exist in the taxonomy.
- An SIF_POTENTIAL assessment must be backed by valid evidence for all three rubric pillars.
- INSUFFICIENT_INFORMATION must list the facts needed.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..knowledge.loader import get_rubric, get_taxonomy
from ..schemas.analysis import AnalysisOutput, Quote

_WS = re.compile(r"\s+")


class OutputValidationError(ValueError):
    """Raised when output cannot be accepted (used by the LLM adapter to retry)."""

    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems))
        self.problems = problems


@dataclass
class ValidationReport:
    quotes_total: int = 0
    quotes_valid_exact: int = 0
    quotes_repaired: int = 0
    quotes_invalid: int = 0
    invalid_quotes: list[str] = field(default_factory=list)
    dropped: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "quotes_total": self.quotes_total,
            "quotes_valid_exact": self.quotes_valid_exact,
            "quotes_repaired": self.quotes_repaired,
            "quotes_invalid": self.quotes_invalid,
            "invalid_quotes": self.invalid_quotes[:20],
            "dropped": self.dropped,
            "warnings": self.warnings,
        }


def locate_quote(text: str, quote: str, start: int | None, end: int | None) -> tuple[int, int, bool] | None:
    """Return (start, end, repaired) for a quote that exists in text, else None.

    Order: exact offsets -> exact substring -> whitespace/case-insensitive match.
    The returned span always points into the original text.
    """
    if not quote:
        return None
    if start is not None and end is not None and 0 <= start < end <= len(text) and text[start:end] == quote:
        return start, end, False
    idx = text.find(quote)
    if idx >= 0:
        # Prefer the occurrence closest to the claimed start when the quote repeats.
        if start is not None:
            best, pos = idx, idx
            while pos >= 0:
                if abs(pos - start) < abs(best - start):
                    best = pos
                pos = text.find(quote, pos + 1)
            idx = best
        return idx, idx + len(quote), start != idx or end != idx + len(quote)
    # Tolerant match: collapse whitespace, ignore case, map back to original offsets.
    parts = [re.escape(p) for p in _WS.split(quote.strip()) if p]
    if not parts:
        return None
    m = re.search(r"\s+".join(parts), text, re.IGNORECASE)
    if m:
        return m.start(), m.end(), True
    return None


def _check_quotes(quotes: list[Quote], text: str, rep: ValidationReport, owner: str) -> list[Quote]:
    kept: list[Quote] = []
    seen: set[tuple[int, int]] = set()
    for q in quotes:
        rep.quotes_total += 1
        loc = locate_quote(text, q.quote, q.start, q.end)
        if loc is None:
            rep.quotes_invalid += 1
            rep.invalid_quotes.append(f"{owner}: {q.quote[:120]}")
            continue
        s, e, repaired = loc
        if repaired:
            rep.quotes_repaired += 1
        else:
            rep.quotes_valid_exact += 1
        if (s, e) in seen:
            continue
        seen.add((s, e))
        kept.append(Quote(quote=text[s:e], start=s, end=e))
    return kept


def validate_output(output: AnalysisOutput, text: str, *, strict: bool) -> tuple[AnalysisOutput, ValidationReport]:
    """Validate and normalise `output` against `text`.

    strict=True (LLM): unknown categories / unsupported SIF raise OutputValidationError.
    strict=False (baseline): the same checks raise too - the baseline must also satisfy them;
    the flag only controls whether vocabulary problems are fatal or downgraded to warnings.
    """
    tax = get_taxonomy()
    rubric = get_rubric()
    rep = ValidationReport()
    problems: list[str] = []
    out = output.model_copy(deep=True)

    # --- vocabulary checks ---
    if out.activity is not None and out.activity.category not in tax.activity_categories:
        msg = f"unknown activity category '{out.activity.category}'"
        if strict:
            problems.append(msg)
        else:
            rep.warnings.append(msg)
            out.activity.category = "other"
    for h in out.hazards:
        if h.category not in tax.hazard_categories:
            msg = f"unknown hazard category '{h.category}'"
            if strict:
                problems.append(msg)
            else:
                rep.warnings.append(msg)
                h.category = "other"
    for b in out.barriers:
        if b.category not in tax.barrier_categories:
            msg = f"unknown barrier category '{b.category}'"
            if strict:
                problems.append(msg)
            else:
                rep.warnings.append(msg)
                b.category = "other"
    for t in out.rule_tags:
        if t.rule_id not in tax.rules:
            problems.append(f"unknown rule_id '{t.rule_id}' (allowed: {', '.join(tax.rule_ids)})")
    for oh in out.other_hazards:
        if oh.id not in tax.other_hazards:
            msg = f"unknown other_hazard id '{oh.id}'"
            if strict:
                problems.append(msg)
            else:
                rep.warnings.append(msg)
    if problems:
        raise OutputValidationError(problems)

    # --- evidence checks against the original text ---
    if out.activity is not None:
        out.activity.evidence = _check_quotes(out.activity.evidence, text, rep, "activity")
    for h in out.hazards:
        h.evidence = _check_quotes(h.evidence, text, rep, f"hazard:{h.category}")
    out.exposure.evidence = _check_quotes(out.exposure.evidence, text, rep, "exposure")
    for b in out.barriers:
        b.evidence = _check_quotes(b.evidence, text, rep, f"barrier:{b.category}")
    if out.potential_consequence is not None:
        out.potential_consequence.evidence = _check_quotes(
            out.potential_consequence.evidence, text, rep, "consequence"
        )
    for oh in out.other_hazards:
        oh.evidence = _check_quotes(oh.evidence, text, rep, f"other_hazard:{oh.id}")

    # Rule tags: merge duplicates; a tag with no valid evidence is not shown as supported.
    merged: dict[str, object] = {}
    for t in out.rule_tags:
        t.evidence = _check_quotes(t.evidence, text, rep, f"rule:{t.rule_id}")
        if not t.evidence:
            rep.dropped.append(f"rule tag {t.rule_id} dropped: no valid evidence quote")
            continue
        if t.rule_id in merged:
            prev = merged[t.rule_id]
            prev.evidence.extend(t.evidence)  # type: ignore[attr-defined]
            if t.status == "breach":
                prev.status = "breach"  # type: ignore[attr-defined]
            continue
        merged[t.rule_id] = t
    out.rule_tags = list(merged.values())  # type: ignore[assignment]
    out.other_hazards = [oh for oh in out.other_hazards if oh.evidence or not strict]

    # Facts whose only support was invalid are kept as claims but carry no evidence; a barrier
    # stated as failed/effective without valid evidence is downgraded to unknown.
    for b in out.barriers:
        if b.status != "unknown" and not b.evidence:
            rep.dropped.append(f"barrier {b.category} status '{b.status}' downgraded to unknown: no valid evidence")
            b.status = "unknown"
    if out.exposure.status in ("actual", "credible", "none", "prevented") and not out.exposure.evidence:
        rep.dropped.append(f"exposure status '{out.exposure.status}' downgraded to unknown: no valid evidence")
        out.exposure.status = "unknown"

    # --- rubric consistency ---
    serious = set(rubric.serious_mechanisms)
    if out.assessment == "SIF_POTENTIAL":
        missing = []
        if not any(h.category in serious and h.evidence for h in out.hazards):
            missing.append("a serious/fatal harm mechanism with a valid evidence quote")
        if out.exposure.status not in ("actual", "credible") or not out.exposure.evidence:
            missing.append("actual or credible exposure with a valid evidence quote")
        if not any(b.status == "failed" and b.critical and b.evidence for b in out.barriers):
            missing.append("a failed/absent/ineffective critical barrier with a valid evidence quote")
        if missing:
            raise OutputValidationError(["SIF_POTENTIAL is not supported by the report text: missing " + "; ".join(missing)])
    if out.assessment == "INSUFFICIENT_INFORMATION" and not out.missing_information:
        raise OutputValidationError(["INSUFFICIENT_INFORMATION requires a list of missing facts"])

    out.missing_information = [m.strip() for m in out.missing_information if m and m.strip()][:8]
    return out, rep
