# SIF rubric, taxonomy and versioning

## Status
`rubric-v1.0.0-proposed` is a **proposed prototype rubric** written by the SafetyLens team. It is configurable and awaits
alignment with OIL's domain definition of Serious Injury & Fatality potential. Every analysis stores the rubric, taxonomy,
engine (and, for the LLM, prompt and model) versions it was produced with.

Files (all YAML, all versioned):

| File | Purpose |
|---|---|
| `backend/app/knowledge/rubric_v1.yaml` | Assessment classes, principles, serious-mechanism list, thresholds (`RUBRIC_PATH` to swap) |
| `backend/app/knowledge/taxonomy_v1.yaml` | Life-Saving Rule IDs/labels + source links, other hazards, controlled vocabularies for activity, hazard and barrier categories (`TAXONOMY_PATH`) |
| `backend/app/knowledge/baseline_lexicon_v1.yaml` | Deterministic patterns used only by the baseline engine (`LEXICON_PATH`) |

## Assessment classes
- **SIF_POTENTIAL** — all three pillars are supported by quotes from the report:
  1. a credible serious-injury or fatal **harm mechanism** (fall from height, suspended load, dropped object, hazardous energy,
     electrical, hazardous atmosphere, fire/explosion, vehicle, caught-between, pressure release);
  2. **actual or credible exposure** of a person to that mechanism;
  3. a **critical barrier stated or demonstrated to be failed, absent or ineffective**.
- **NON_SIF_POTENTIAL** — there is sufficient explicit context: only minor mechanisms, exposure stated absent or prevented,
  critical controls stated effective, or the report only refers to a historical discussion.
- **INSUFFICIENT_INFORMATION** — an abstention, not a negative. Used when a pillar is missing or the report contradicts itself;
  always returned with a concise list of the facts needed.

## Principles enforced
- Potential severity, not actual injury: a no-injury near miss can be SIF potential; a minor injury does not cap potential.
- A safeguard is never assumed absent because it is not mentioned. A barrier counts as failed only when the text says so or the
  stated event demonstrates it (e.g. "started unexpectedly" during maintenance; a person walking under a suspended load shows the
  exclusion zone was ineffective).
- Actual, prevented, hypothetical and historical events are distinguished (`event_modality`). Barrier failures and exposure in
  hypothetical or historical clauses do not count as actual.
- SIF potential is assessed independently of Life-Saving Rule relevance and breach status (an expired permit for ground-level
  painting is an `LSR-08` breach without SIF potential).
- Reports outside the taxonomy are not forced into a rule; other hazards are listed separately.
- Locations, dates, equipment, exposure and barrier failures are never invented; unknowns stay unknown.
- Report text is data. Instruction-like text in a report is flagged and has no effect.

## Life-Saving Rules
`LSR-01` Bypassing Safety Controls · `LSR-02` Confined Space · `LSR-03` Driving · `LSR-04` Energy Isolation · `LSR-05` Hot Work ·
`LSR-06` Line of Fire · `LSR-07` Safe Mechanical Lifting · `LSR-08` Work Authorisation · `LSR-09` Working at Height.

Sources: https://www.iogp.org/workstreams/safety/safety/life-savingrules/ ·
https://www.iogp.org/wp-content/uploads/2018/08/Life-SavingRules-WorkCard.pdf. Only the IDs and text labels are used; the scope
notes are SafetyLens paraphrases, and official icons and statements are not reproduced.

Each tag carries: relevance (`primary`/`secondary`), status (`breach` = a related control stated failed/absent, `control` = stated
in place, `unclear` = relevant but not stated), exact evidence quotes and a short explanation.

## Changing the rubric
1. Copy `rubric_v1.yaml` to `rubric_v2.yaml`, change `version`, edit classes, principles or the serious-mechanism list.
2. Point `RUBRIC_PATH` at it and restart. New analyses record the new version; earlier analyses keep theirs.
3. Re-analyse reports (Report Detail → Re-analyse) to create new analysis versions, and re-run the evaluation.
