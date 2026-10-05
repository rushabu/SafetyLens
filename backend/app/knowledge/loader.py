"""Loads the versioned taxonomy, rubric and baseline lexicon from YAML."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from ..config import get_settings

FLAGS = re.IGNORECASE


def _load(path: Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


@dataclass(frozen=True)
class Taxonomy:
    version: str
    source_urls: list[str]
    rules: dict[str, dict[str, str]]  # rule_id -> {label, scope_note}
    other_hazards: dict[str, str]  # id -> label
    activity_categories: dict[str, str]
    hazard_categories: dict[str, dict[str, str]]  # id -> {label, severity}
    barrier_categories: dict[str, dict[str, Any]]  # id -> {label, rules}
    raw: dict[str, Any] = field(repr=False)

    @property
    def rule_ids(self) -> list[str]:
        return list(self.rules)

    def serious_hazards(self) -> set[str]:
        return {k for k, v in self.hazard_categories.items() if v.get("severity") == "serious"}


@dataclass(frozen=True)
class Rubric:
    version: str
    status: str
    serious_mechanisms: list[str]
    thresholds: dict[str, int]
    raw: dict[str, Any] = field(repr=False)


@lru_cache
def get_taxonomy() -> Taxonomy:
    raw = _load(get_settings().taxonomy_path)
    return Taxonomy(
        version=raw["version"],
        source_urls=list(raw["source"]["urls"]),
        rules={r["id"]: {"label": r["label"], "scope_note": r["scope_note"]} for r in raw["life_saving_rules"]},
        other_hazards={h["id"]: h["label"] for h in raw["other_hazards"]},
        activity_categories=dict(raw["activity_categories"]),
        hazard_categories=dict(raw["hazard_categories"]),
        barrier_categories=dict(raw["barrier_categories"]),
        raw=raw,
    )


@lru_cache
def get_rubric() -> Rubric:
    raw = _load(get_settings().rubric_path)
    return Rubric(
        version=raw["version"],
        status=raw.get("status", "proposed"),
        serious_mechanisms=list(raw["serious_mechanisms"]),
        thresholds=dict(raw.get("thresholds", {})),
        raw=raw,
    )


def _compile(patterns: list[str]) -> list[re.Pattern[str]]:
    return [re.compile(p, FLAGS) for p in patterns]


@dataclass(frozen=True)
class BarrierLexicon:
    critical: bool
    on_conflict: str
    failed: list[re.Pattern[str]]
    effective: list[re.Pattern[str]]


@dataclass(frozen=True)
class Lexicon:
    version: str
    negation_triggers: re.Pattern[str]
    negation_terminators: re.Pattern[str]
    negation_window_words: int
    clause_split: re.Pattern[str]
    modality: dict[str, list[re.Pattern[str]]]
    consequence: list[re.Pattern[str]]
    injection: list[re.Pattern[str]]
    activities: dict[str, list[re.Pattern[str]]]
    activity_priority: list[str]
    hazards: dict[str, list[re.Pattern[str]]]
    exposure: dict[str, list[re.Pattern[str]]]
    barriers: dict[str, BarrierLexicon]
    barrier_implies_mechanism: dict[str, str]
    rule_triggers: dict[str, list[re.Pattern[str]]]
    hazard_to_other: dict[str, str]
    hazard_to_other_unless_rule: dict[str, dict[str, Any]]


@lru_cache
def get_lexicon() -> Lexicon:
    raw = _load(get_settings().lexicon_path)
    return Lexicon(
        version=raw["version"],
        negation_triggers=re.compile(raw["negation_triggers"], FLAGS),
        negation_terminators=re.compile(raw["negation_terminators"], FLAGS),
        negation_window_words=int(raw["negation_window_words"]),
        clause_split=re.compile(raw["clause_split"], FLAGS),
        modality={k: _compile(v) for k, v in raw["modality"].items()},
        consequence=_compile(raw["consequence"]),
        injection=_compile(raw["injection"]),
        activities={k: _compile(v) for k, v in raw["activities"].items()},
        activity_priority=list(raw["activity_priority"]),
        hazards={k: _compile(v) for k, v in raw["hazards"].items()},
        exposure={k: _compile(v) for k, v in raw["exposure"].items()},
        barriers={
            k: BarrierLexicon(
                critical=bool(v.get("critical", True)),
                on_conflict=v.get("on_conflict", "unknown"),
                failed=_compile(v.get("failed", [])),
                effective=_compile(v.get("effective", [])),
            )
            for k, v in raw["barriers"].items()
        },
        barrier_implies_mechanism=dict(raw["barrier_implies_mechanism"]),
        rule_triggers={k: _compile(v) for k, v in raw["rule_triggers"].items()},
        hazard_to_other=dict(raw["hazard_to_other"]),
        hazard_to_other_unless_rule=dict(raw["hazard_to_other_unless_rule"]),
    )


def knowledge_versions() -> dict[str, str]:
    return {
        "taxonomy_version": get_taxonomy().version,
        "rubric_version": get_rubric().version,
        "lexicon_version": get_lexicon().version,
    }
