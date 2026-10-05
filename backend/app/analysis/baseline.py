"""Deterministic rule-based BASELINE engine.

This is transparent pattern matching over a versioned lexicon - NOT a trained model and NOT
an LLM. It exists so the application works with no credentials and so the main engine has
a reproducible point of comparison. It implements the proposed rubric literally:

  SIF_POTENTIAL      = serious mechanism AND actual/credible exposure AND failed critical barrier
  NON_SIF_POTENTIAL  = sufficient explicit context (minor-only mechanism, exposure stated absent/
                       prevented, or critical controls stated effective)
  INSUFFICIENT_INFO  = anything else, with the list of facts needed

A barrier is only "failed" when the text says so (or the stated event demonstrates it, e.g.
"started unexpectedly"); silence never counts as failure.
"""
from __future__ import annotations

import time
from collections import Counter, defaultdict

from ..knowledge.loader import get_lexicon, get_rubric, get_taxonomy
from ..schemas.analysis import (
    Activity,
    AnalysisOutput,
    Barrier,
    Consequence,
    EngineInfo,
    EngineResult,
    Exposure,
    Hazard,
    OtherHazard,
    Quote,
    RuleTagOut,
)
from .text_utils import Match, find_all, is_negated, split_clauses, word_count
from .validation import OutputValidationError, validate_output

ENGINE_VERSION = "baseline-v1.0.0"
_ACTIVE = ("actual", "prevented")  # clause modalities in which a stated fact counts as having happened


def _q(matches: list[Match], limit: int = 3) -> list[Quote]:
    return [Quote(quote=m.quote, start=m.start, end=m.end) for m in matches[:limit]]


class BaselineEngine:
    engine_type = "baseline"

    def info(self) -> EngineInfo:
        return EngineInfo(
            engine_type="baseline",
            engine_version=f"{ENGINE_VERSION}+{get_lexicon().version}",
            model=None,
            prompt_version=None,
            rubric_version=get_rubric().version,
            taxonomy_version=get_taxonomy().version,
        )

    def analyse(self, text: str) -> EngineResult:
        t0 = time.perf_counter()
        info = self.info()
        try:
            output = self._analyse(text)
            output, rep = validate_output(output, text, strict=False)
            return EngineResult(
                info=info,
                output=output,
                validation=rep.as_dict(),
                latency_ms=int((time.perf_counter() - t0) * 1000),
            )
        except OutputValidationError as exc:  # should not happen; surfaced honestly if it does
            return EngineResult(
                info=info,
                error=f"Baseline output failed validation: {exc}",
                latency_ms=int((time.perf_counter() - t0) * 1000),
            )

    # ------------------------------------------------------------------
    def _analyse(self, text: str) -> AnalysisOutput:
        lex = get_lexicon()
        tax = get_taxonomy()
        rubric = get_rubric()
        clauses = split_clauses(text, lex)
        wc = word_count(text)

        def positive(patterns, *, modalities=("actual", "prevented", "hypothetical")) -> list[Match]:
            return [
                m
                for m in find_all(patterns, text, clauses)
                if m.clause.modality in modalities and not is_negated(text, m.start, m.clause, lex)
            ]

        flags: list[str] = []
        if find_all(lex.injection, text, clauses):
            flags.append("instruction_like_text")

        # ---- activity ----
        act_hits: dict[str, list[Match]] = {}
        for cat, pats in lex.activities.items():
            ms = positive(pats, modalities=("actual", "prevented", "hypothetical"))
            if ms:
                act_hits[cat] = ms
        activity = None
        if act_hits:
            prio = {c: i for i, c in enumerate(lex.activity_priority)}
            best = sorted(act_hits, key=lambda c: (-len(act_hits[c]), prio.get(c, 99)))[0]
            activity = Activity(
                category=best, description=tax.activity_categories.get(best), evidence=_q(act_hits[best], 2)
            )

        # ---- hazards (mechanisms) ----
        hazard_hits: dict[str, list[Match]] = {}
        for cat, pats in lex.hazards.items():
            ms = positive(pats)
            if ms:
                hazard_hits[cat] = ms

        # ---- barriers ----
        barriers: list[Barrier] = []
        conflicts: list[str] = []
        barrier_defects: dict[str, list[Match]] = {}
        for cat, bl in lex.barriers.items():
            # Failure phrases carry their own polarity ("without a permit"); a short negation
            # window still catches "No sparks reached ..." style denials.
            failed = [
                m
                for m in find_all(bl.failed, text, clauses)
                if m.clause.modality in _ACTIVE and not is_negated(text, m.start, m.clause, lex, window=2)
            ]
            effective = [
                m
                for m in find_all(bl.effective, text, clauses)
                if m.clause.modality in _ACTIVE and not is_negated(text, m.start, m.clause, lex)
            ]
            # An "effective" match that overlaps a "failed" match is the failed phrase itself.
            effective = [e for e in effective if not any(f.start <= e.start < f.end for f in failed)]
            if not failed and not effective:
                continue
            if failed:
                barrier_defects[cat] = failed
            label = tax.barrier_categories.get(cat, {}).get("label", cat)
            if failed and not effective:
                status, ev = "failed", failed
            elif effective and not failed:
                status, ev = "effective", effective
            elif bl.on_conflict == "effective":
                status, ev = "effective", effective + failed
            else:
                status, ev = "unknown", failed + effective
                conflicts.append(label)
            barriers.append(
                Barrier(category=cat, description=label, status=status, critical=bl.critical, evidence=_q(ev, 3))
            )

        # A stated barrier defect demonstrates the mechanism that barrier protects against
        # (e.g. "frayed sling" -> suspended-load mechanism), and supplies that evidence.
        for b, defect in barrier_defects.items():
            mech = lex.barrier_implies_mechanism.get(b)
            if mech and mech not in hazard_hits and defect:
                hazard_hits[mech] = defect
        hazards = [
            Hazard(
                category=cat,
                description=tax.hazard_categories.get(cat, {}).get("label"),
                evidence=_q(ms, 3),
            )
            for cat, ms in hazard_hits.items()
            if ms
        ]

        # ---- exposure ----
        exp_actual: list[Match] = []
        exp_none: list[Match] = []
        exp_prevented: list[Match] = []
        for m in find_all(lex.exposure["actual"], text, clauses):
            if is_negated(text, m.start, m.clause, lex):
                exp_none.append(m)
            elif m.clause.modality == "actual":
                exp_actual.append(m)
            elif m.clause.modality == "prevented":
                exp_prevented.append(m)
        exp_credible = [
            m
            for m in find_all(lex.exposure["credible"], text, clauses)
            if m.clause.modality == "actual" and not is_negated(text, m.start, m.clause, lex)
        ]
        exp_none += [m for m in find_all(lex.exposure["none"], text, clauses) if m.clause.modality in _ACTIVE]
        prevented_cues = [m for m in find_all(lex.modality["prevented"], text, clauses)]
        if exp_actual:
            exposure = Exposure(status="actual", description="Person(s) stated to be in the harm zone", evidence=_q(exp_actual))
        elif exp_credible:
            exposure = Exposure(status="credible", description="People stated to be present nearby", evidence=_q(exp_credible))
        elif exp_none:
            exposure = Exposure(status="none", description="Report states no one was exposed", evidence=_q(exp_none))
        elif prevented_cues:
            exposure = Exposure(
                status="prevented",
                description="Hazard identified/controlled before anyone was exposed",
                evidence=_q(exp_prevented + prevented_cues),
            )
        else:
            exposure = Exposure(status="unknown", description=None, evidence=[])

        # ---- event modality ----
        concept_clauses = {
            m.clause.modality
            for group in (list(hazard_hits.values()) + [exp_actual, exp_credible, exp_none, exp_prevented])
            for m in group
        }
        for b in barriers:
            concept_clauses.add("actual")
        if exposure.status == "actual" or any(b.status == "failed" for b in barriers):
            modality = "actual" if "prevented" not in {c.modality for c in clauses} or exposure.status == "actual" else "prevented"
        elif prevented_cues:
            modality = "prevented"
        elif concept_clauses and concept_clauses <= {"historical"}:
            modality = "historical"
        elif concept_clauses and concept_clauses <= {"hypothetical", "historical"}:
            modality = "hypothetical"
        elif clauses and all(c.modality == "historical" for c in clauses):
            modality = "historical"
        elif concept_clauses:
            modality = "actual"
        else:
            modality = "unclear"

        # ---- consequence ----
        cons = find_all(lex.consequence, text, clauses)
        consequence = Consequence(description=cons[0].quote, evidence=_q(cons, 1)) if cons else None

        # ---- rule tags ----
        rule_tags = self._rule_tags(text, clauses, barriers, lex, tax)
        tagged = {t.rule_id for t in rule_tags}

        # ---- other hazards (kept outside the LSR list) ----
        others: dict[str, OtherHazard] = {}
        for cat, ms in hazard_hits.items():
            if not ms:
                continue
            oh = lex.hazard_to_other.get(cat)
            if oh is None and cat in lex.hazard_to_other_unless_rule:
                spec = lex.hazard_to_other_unless_rule[cat]
                if not tagged.intersection(spec["unless"]):
                    oh = spec["other"]
            if oh and oh not in others:
                others[oh] = OtherHazard(id=oh, explanation=tax.other_hazards.get(oh, oh), evidence=_q(ms, 2))
        for b in barriers:
            if b.category == "ppe" and b.status == "failed" and "OH-PPE" not in others:
                others["OH-PPE"] = OtherHazard(id="OH-PPE", explanation=tax.other_hazards["OH-PPE"], evidence=b.evidence)
        if activity and activity.category == "housekeeping" and "OH-HOUSEKEEPING" not in others:
            others["OH-HOUSEKEEPING"] = OtherHazard(
                id="OH-HOUSEKEEPING", explanation=tax.other_hazards["OH-HOUSEKEEPING"], evidence=activity.evidence
            )

        # ---- decision ----
        serious_set = set(rubric.serious_mechanisms)
        serious = [h for h in hazards if h.category in serious_set]
        minor = [h for h in hazards if tax.hazard_categories.get(h.category, {}).get("severity") == "minor"]
        failed_crit = [b for b in barriers if b.status == "failed" and b.critical]
        effective_crit = [b for b in barriers if b.status == "effective" and b.critical]
        min_words = int(rubric.thresholds.get("min_words_for_non_sif", 12))
        missing: list[str] = []

        def lbl(items, key="description"):
            return ", ".join(sorted({getattr(i, key) or i.category for i in items}))

        all_historical = bool(clauses) and all(c.modality == "historical" for c in clauses)
        if all_historical and wc >= min_words:
            assessment = "NON_SIF_POTENTIAL"
            rationale = (
                "The report only refers to a historical event or discussion (e.g. a toolbox talk); it does "
                "not describe a current exposure or barrier failure."
            )
        elif wc < 6 or (activity is None and not hazards and not barriers and exposure.status == "unknown"):
            assessment = "INSUFFICIENT_INFORMATION"
            rationale = "The narrative is too vague to identify an activity, harm mechanism, exposure or controls."
            missing += [
                "What task/activity was being performed and where",
                "What could have caused harm (e.g. fall, suspended load, energy release)",
                "Whether anyone was exposed and how close they were",
                "Which controls were in place and whether they worked",
            ]
        elif modality == "historical" and exposure.status not in ("actual", "credible") and not failed_crit:
            assessment = "NON_SIF_POTENTIAL"
            rationale = (
                "The report refers to a historical event or discussion (e.g. a toolbox talk); it does not "
                "describe a current exposure or barrier failure."
            )
        elif serious:
            if conflicts:
                assessment = "INSUFFICIENT_INFORMATION"
                rationale = f"Serious mechanism present ({lbl(serious)}) but the report contradicts itself about: {', '.join(conflicts)}."
                missing += [f"Resolve contradictory statements about: {c}" for c in conflicts]
            elif exposure.status in ("actual", "credible") and failed_crit:
                assessment = "SIF_POTENTIAL"
                rationale = (
                    f"Serious mechanism ({lbl(serious)}) with {exposure.status} exposure and failed/absent "
                    f"critical barrier(s): {lbl(failed_crit)}. Assessed on potential, not actual outcome."
                )
            elif exposure.status in ("none", "prevented"):
                assessment = "NON_SIF_POTENTIAL"
                rationale = (
                    f"Serious mechanism ({lbl(serious)}) identified, but the report states exposure was "
                    f"{'prevented' if exposure.status == 'prevented' else 'absent'}"
                    + (f"; barrier issue noted: {lbl(failed_crit)}." if failed_crit else "")
                    + (f"; control worked: {lbl(effective_crit)}." if effective_crit else ".")
                )
            elif effective_crit and not failed_crit:
                assessment = "NON_SIF_POTENTIAL"
                rationale = f"Serious mechanism ({lbl(serious)}) controlled: barriers stated effective - {lbl(effective_crit)}."
            else:
                assessment = "INSUFFICIENT_INFORMATION"
                rationale = f"Serious mechanism ({lbl(serious)}) identified but the rubric pillars are not all supported."
                if modality == "hypothetical":
                    missing.append("Whether the described situation actually occurred or is a hypothetical concern")
                if exposure.status == "unknown":
                    missing.append("Whether anyone was exposed to the hazard (present in the danger zone) and how close")
                if not failed_crit and not effective_crit:
                    rel = sorted({c for t in rule_tags for c in self._barriers_for_rule(t.rule_id, tax)})
                    names = ", ".join(tax.barrier_categories[c]["label"] for c in rel[:3]) if rel else "relevant critical controls"
                    missing.append(f"Which critical controls were in place and whether they worked ({names})")
        else:
            if failed_crit:
                assessment = "INSUFFICIENT_INFORMATION"
                rationale = f"Barrier failure reported ({lbl(failed_crit)}) but no harm mechanism could be identified."
                missing.append("What hazard / harm mechanism the failed control was protecting against")
                if exposure.status == "unknown":
                    missing.append("Whether anyone was exposed and how close they were")
            elif minor and wc >= min_words:
                assessment = "NON_SIF_POTENTIAL"
                rationale = f"Only minor-severity mechanisms described ({lbl(minor)}); no serious/fatal mechanism is stated."
            elif effective_crit and wc >= min_words:
                assessment = "NON_SIF_POTENTIAL"
                rationale = f"Controls stated effective ({lbl(effective_crit)}) and no serious/fatal mechanism is described."
            else:
                assessment = "INSUFFICIENT_INFORMATION"
                rationale = "No harm mechanism could be identified from the narrative."
                missing.append("What could have caused harm and how severe it could have been")
                if exposure.status == "unknown":
                    missing.append("Whether anyone was exposed and how close they were")
                if activity is None:
                    missing.append("What task/activity was being performed")

        pillars = sum(
            [
                any(h.evidence for h in hazards),
                exposure.status != "unknown" and bool(exposure.evidence),
                any(b.status != "unknown" and b.evidence for b in barriers),
            ]
        )
        sufficiency = {3: "strong", 2: "moderate", 1: "limited", 0: "insufficient"}[pillars]
        if "instruction_like_text" in flags:
            rationale += " Note: the report contains instruction-like text, which was treated as data and ignored."

        return AnalysisOutput(
            assessment=assessment,
            rationale=rationale,
            event_modality=modality,
            activity=activity,
            hazards=hazards,
            exposure=exposure,
            barriers=barriers,
            potential_consequence=consequence if serious else (consequence if consequence and not minor else None),
            rule_tags=rule_tags,
            other_hazards=list(others.values()),
            missing_information=missing,
            evidence_sufficiency=sufficiency,
            flags=flags,
        )

    @staticmethod
    def _barriers_for_rule(rule_id: str, tax) -> list[str]:  # noqa: ANN001
        return [c for c, v in tax.barrier_categories.items() if rule_id in (v.get("rules") or [])]

    def _rule_tags(self, text, clauses, barriers, lex, tax) -> list[RuleTagOut]:  # noqa: ANN001
        trig: dict[str, list[Match]] = defaultdict(list)
        for rid, pats in lex.rule_triggers.items():
            for m in find_all(pats, text, clauses):
                if m.clause.modality != "historical" and not is_negated(text, m.start, m.clause, lex):
                    trig[rid].append(m)

        by_rule: dict[str, list[Barrier]] = defaultdict(list)
        for b in barriers:
            rules = tax.barrier_categories.get(b.category, {}).get("rules") or []
            for rid in rules:
                # A barrier shared by several rules only tags rules that have their own trigger.
                if len(rules) == 1 or trig.get(rid):
                    by_rule[rid].append(b)

        tags: list[RuleTagOut] = []
        counts = Counter({rid: len(ms) for rid, ms in trig.items()})
        for rid in tax.rule_ids:
            ms, bs = trig.get(rid, []), by_rule.get(rid, [])
            if not ms and not bs:
                continue
            failed = [b for b in bs if b.status == "failed"]
            eff = [b for b in bs if b.status == "effective"]
            label = tax.rules[rid]["label"]
            if failed:
                status = "breach"
                expl = f"{label}: control stated failed/absent - " + ", ".join(b.description or b.category for b in failed)
            elif eff:
                status = "control"
                expl = f"{label}: control stated in place/effective - " + ", ".join(b.description or b.category for b in eff)
            else:
                status = "unclear"
                expl = f"{label} is relevant to the activity described; control status not stated."
            ev: list[Quote] = []
            for b in failed + eff:
                ev.extend(b.evidence[:2])
            ev.extend(_q(ms, 2))
            tags.append(RuleTagOut(rule_id=rid, relevance="secondary", status=status, explanation=expl, evidence=ev[:4]))

        if tags:
            breach = [t for t in tags if t.status == "breach"]
            primary = breach or [max(tags, key=lambda t: counts.get(t.rule_id, 0))]
            for t in primary:
                t.relevance = "primary"
        return tags
