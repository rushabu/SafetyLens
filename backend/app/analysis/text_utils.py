"""Offset-preserving text segmentation, modality and negation helpers for the baseline."""
from __future__ import annotations

import re
from dataclasses import dataclass

from ..knowledge.loader import Lexicon

_SENT = re.compile(r"[^.!?\n]+[.!?]*", re.MULTILINE)
_WORD = re.compile(r"[A-Za-z0-9'%/-]+")


@dataclass(frozen=True)
class Clause:
    start: int
    end: int
    text: str
    modality: str  # actual | prevented | hypothetical | historical


@dataclass(frozen=True)
class Match:
    start: int
    end: int
    quote: str
    clause: Clause


def split_clauses(text: str, lex: Lexicon) -> list[Clause]:
    clauses: list[Clause] = []
    for sm in _SENT.finditer(text):
        s_start, s_text = sm.start(), sm.group(0)
        # A whole sentence that is historical (e.g. toolbox talk) colours all its clauses.
        sent_hist = any(p.search(s_text) for p in lex.modality["historical"])
        sent_if = re.search(r"\bif\b", s_text, re.IGNORECASE) is not None
        cuts = [0] + [m.start() for m in lex.clause_split.finditer(s_text)] + [len(s_text)]
        for a, b in zip(cuts, cuts[1:]):
            seg = s_text[a:b]
            stripped = seg.strip()
            if not stripped:
                continue
            off = s_start + a + (len(seg) - len(seg.lstrip()))
            modality = clause_modality(stripped, lex)
            if sent_hist:
                modality = "historical"
            elif sent_if and modality == "actual":
                # "If X had happened, Y would ..." - conditional sentences are hypothetical.
                modality = "hypothetical"
            clauses.append(Clause(off, off + len(stripped), stripped, modality))
    return clauses


def clause_modality(clause: str, lex: Lexicon) -> str:
    for kind in ("historical", "hypothetical", "prevented"):
        if any(p.search(clause) for p in lex.modality[kind]):
            return kind
    return "actual"


def is_negated(text: str, start: int, clause: Clause, lex: Lexicon, window: int | None = None) -> bool:
    """NegEx-style: a negation trigger within N words before `start`, inside the same clause,
    with no scope terminator between the trigger and the mention."""
    scope = text[clause.start:start]
    # Only look at the tail of the clause up to a terminator.
    last_term = None
    for m in lex.negation_terminators.finditer(scope):
        last_term = m
    if last_term is not None:
        scope = scope[last_term.end():]
    words = _WORD.findall(scope)
    tail = " ".join(words[-(window or lex.negation_window_words):])
    return lex.negation_triggers.search(tail) is not None


def find_all(patterns: list[re.Pattern[str]], text: str, clauses: list[Clause]) -> list[Match]:
    out: list[Match] = []
    for p in patterns:
        for m in p.finditer(text):
            if m.end() <= m.start():
                continue
            cl = clause_for(m.start(), clauses)
            if cl is None:
                continue
            s, e = m.start(), m.end()
            # Trim whitespace so quotes are tight.
            while s < e and text[s].isspace():
                s += 1
            while e > s and text[e - 1].isspace():
                e -= 1
            out.append(Match(s, e, text[s:e], cl))
    out.sort(key=lambda x: (x.start, -(x.end - x.start)))
    # Drop matches fully contained in an earlier, longer match.
    dedup: list[Match] = []
    for m in out:
        if any(d.start <= m.start and m.end <= d.end for d in dedup):
            continue
        dedup.append(m)
    return dedup


def clause_for(pos: int, clauses: list[Clause]) -> Clause | None:
    for c in clauses:
        if c.start <= pos < c.end:
            return c
    # Match may begin in inter-clause whitespace; attach to the next clause.
    for c in clauses:
        if pos < c.start:
            return c
    return clauses[-1] if clauses else None


def word_count(text: str) -> int:
    return len(_WORD.findall(text))
