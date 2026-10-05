# Evaluation — synthetic dataset

> **SYNTHETIC / ILLUSTRATIVE ONLY.** The reports were produced by `backend/seed/generate_synthetic.py` and the reference labels
> were assigned by the prototype authors. Nothing here is expert-validated and nothing here measures performance on OIL
> reports. Treat these numbers as a regression baseline for the prototype, not as evidence of accuracy.

Reproduce (from `backend/`):
```bash
python -m seed.generate_synthetic --seed 42                               # regenerates identical files
python -m eval.run_eval --engine baseline --split test
python -m eval.run_eval --engine baseline --split test --per-group 2      # same sample as the LLM run
python -m eval.run_eval --engine llm --split test --per-group 2           # needs LLM_* settings; resumable
```
Full JSON results and Markdown summaries are written to `backend/eval/results/` and shown on the app's **Evaluation** page.
LLM runs checkpoint every successful case, so a run interrupted by a rate limit resumes where it stopped.

## Dataset and protocol
- 278 synthetic reports in 56 scenario groups (86 SIF, 162 non-SIF, 30 insufficient-information by reference label, ≈31% SIF —
  close to the ~20–25% fatal-potential share cited in the problem statement). They cover all nine Life-Saving Rules, hazards
  outside the rule list, everyday low-severity observations, and the contrast pairs: suspended load over workers vs. quarantined
  lifting gear; unexpected energisation vs. verified isolation; no-injury near miss with fatal exposure; vague narratives;
  negation and effective controls; prompt-injection text.
- **Split by scenario group** (deterministic hash): paraphrases of a scenario never straddle dev and test. Dev = 181, test = 97.
- Reference labels live in `data/synthetic/reference_labels.csv`, separately from the uploadable `synthetic_reports.csv`.
  Engines receive only report text; a test enforces that application code never reads the labels.
- The baseline lexicon was adjusted **only after inspecting dev-split disagreements**, then frozen. One dev label was revised
  during that process (G39 toolbox talk: rule set changed from none to `LSR-09`). The 13 everyday low-severity groups (H01–H13)
  were added after the lexicon was frozen, so neither engine was tuned on them.

## Results — rule-based baseline, full `test` split (97 reports)

| Metric | Value |
|---|---|
| SIF precision | 1.00 (27 of 27 flagged) |
| SIF recall, end-to-end (abstentions count as not captured) | 0.82 |
| Coverage / abstention rate | 0.67 / 0.33 |
| Reference-SIF capture | 27 captured · 6 abstained · 0 missed as non-SIF · 0 errored |
| Rule tagging micro P / R / F1 | 0.85 / 0.99 / 0.91 (macro F1 0.95) |
| Evidence-span validity | 524 / 524 spans exactly match the original text |
| Processing failures / latency | 0 · p50 ≈ 1 ms |

| reference \ output | SIF | NON_SIF | INSUFFICIENT | ERROR |
|---|---|---|---|---|
| SIF_POTENTIAL | 27 | 0 | 6 | 0 |
| NON_SIF_POTENTIAL | 0 | 38 | 18 | 0 |
| INSUFFICIENT_INFORMATION | 0 | 0 | 8 | 0 |

## Results — baseline vs. LLM on the same stratified sample (39 test reports, 2 per scenario group)

The LLM was evaluated on a stratified sample because Groq's free tier allows 8,000 tokens/minute and 200,000 tokens/day per
model (~4k tokens per analysis). The daily quota for `openai/gpt-oss-120b` was used up during development, so this run used
**`openai/gpt-oss-20b`** (same family, separate quota) with prompt `prompt-v1.1.0` and `reasoning_effort: low`.

| Metric | Baseline | LLM (gpt-oss-20b) |
|---|---|---|
| SIF precision | 1.00 (10/10) | 1.00 (9/9) |
| SIF recall, end-to-end | 0.83 | 0.75 |
| Reference-SIF missed as non-SIF | 0 | 0 |
| Coverage (determinate answers) | 0.69 | 0.44 |
| Reference non-SIF answered correctly | 17 / 23 | 8 / 23 (14 abstained, 1 error) |
| Rule tagging micro P / R / F1 | 0.94 / 0.97 / 0.96 | 1.00 / 0.56 / 0.72 |
| Evidence-span validity | 100% | 100% (148/148 after validation) |
| Processing failures | 0 | 1 (provider-side schema check failed 3×) |
| Latency p50 | ≈ 1 ms | ≈ 30 s (dominated by rate-limit pacing) |

### What this shows
- **Both engines are safe in the direction that matters most here:** neither called a reference-SIF report non-SIF, neither
  produced a false SIF flag, and every evidence quote displayed was verified against the original text. Failures stayed visible
  as a processing error rather than becoming a negative.
- **The LLM, as prompted, is far more conservative.** It abstained on most everyday low-severity reports (minor leak, removed
  hand tool, wasp nest, positive observations) and on two dropped-object near misses, asking for exposure and barrier details.
  The prompt's decision procedure says NON_SIF needs "sufficient explicit context", and the model applies that strictly; the
  baseline instead applies the rubric's "only minor-severity mechanisms" route.
- **The LLM under-tags rules** (precision 1.00, recall 0.56): it tends to list only the primary rule.
- **The baseline's advantage is partly circular** — its lexicon was written alongside the scenario templates — while the LLM had
  never seen them. Neither result says anything about real OIL reports.

### Prompt tuning on the dev split (prompt v1.1 → v1.2)
To avoid tuning on test results, v1.1 was first run on a **dev** sample (36 reports, 1 per scenario group) with
`qwen/qwen3.8-27b` (`reasoning_effort: none`), whose quota was still free. Its dev disagreements drove every v1.2 change:

| Dev finding with v1.1 | v1.2 change | v1.2 on dev (22 of 36 answered*) |
|---|---|---|
| Over-tagging: `LSR-08` on spills/housekeeping, `LSR-09` on a slip, `LSR-05` on a kitchen burn, **all nine rules** on the prompt-injection report; `LSR-08` instead of `LSR-01` for an inhibited detector | Tag a rule only when the text describes that rule's activity or control, with a quote; generic hazards go to other hazards; explicit `LSR-01` vs `LSR-08` guidance | Rule false positives 2 (from 17); micro precision 0.92 |
| H2S sampling (worker at the sample point) abstained | "A person doing the task in the hazardous position is actual exposure" | SIF ✓ |
| Toolbox talk (historical) abstained | Historical references with no current event → non-SIF | Non-SIF ✓ |
| Contradictory harness report called SIF | Contradictions → insufficient information, never resolved by the model | Insufficient ✓ |
| Prompt-injection report abstained | Instruction-like text is dropped; the remaining facts are assessed normally | SIF ✓ |
| — (rubric wording) | Non-SIF route for clearly described minor-only reports, as the rubric's class definition states | — |
| Provider-side schema error (activity returned as a list) | "activity / potential_consequence: a single object or null" | — |

\* The run stopped at Qwen's 200k tokens/day limit; the 14 unanswered dev reports are recorded as processing errors and
will be completed by re-running the same command (checkpointed). A regression seen on dev: v1.2 sometimes omits the rule tag
on vague reports (e.g. "Isolation paperwork to be checked" → no `LSR-04`).

`prompt-v1.2.0` is now the default; `LLM_PROMPT_VERSION=prompt-v1.1.0` restores the old prompt for A/B runs.

### Pending: re-run the test sample with v1.2
Not yet run: all three Groq models (`gpt-oss-120b`, `gpt-oss-20b`, `qwen3.8-27b`) hit their 200k tokens/day limit on
1 Oct 2026. The like-for-like comparison is v1.2 vs the v1.1 result above, both on `openai/gpt-oss-20b` with the same
39-report test sample. From `backend/` once the quota has recovered (≈ 24 h after the previous run):
```bash
LLM_MODEL=openai/gpt-oss-20b LLM_PROMPT_VERSION=prompt-v1.2.0 .venv/Scripts/python -m eval.run_eval --engine llm --split test --per-group 2
```
PowerShell: `$env:LLM_MODEL="openai/gpt-oss-20b"; $env:LLM_PROMPT_VERSION="prompt-v1.2.0"; .venv\Scripts\python -m eval.run_eval --engine llm --split test --per-group 2`.
If the quota runs out midway, re-run the same command; finished cases are reused from checkpoints.

## Error analysis — baseline (full test split)
- **Everyday reports with unseen wording (H groups, 15 reports → abstained).** No lexicon cue for the activity or hazard, so the
  baseline asks for details instead of concluding non-SIF.
- **Hose whip (G12, 6 reports → abstained).** Exposure phrased as "the walkway where the fitter was standing" is not in the lexicon.
- **Expired permit, ground-level painting (G25, 3 reports → abstained).** No harm mechanism, so the baseline asks for the hazard;
  `LSR-08` is tagged *unclear* rather than *breach* because "expired" is too far from "permit" for the pattern.
- **Dropped object from the monkey board (G11).** Correct assessment, but `LSR-09` is also tagged; the reference lists only
  `LSR-06`. The test split has **no LSR-09 scenario groups** (a consequence of the group split).

## Why all of these numbers are optimistic
1. Templated paraphrases are far more regular than real field reports (abbreviations, local language, typos, multi-event narratives).
2. Labels are author-assigned against the authors' own proposed rubric.
3. Small per-rule supports (several rules have ≤ 5 test cases; the LLM sample has ≤ 10 per rule).

A meaningful evaluation needs an independently reviewed sample of real (anonymised) OIL reports labelled against an agreed SIF
definition, with inter-rater agreement measured, run through the same runner (`--dataset` accepts any folder containing
`synthetic_reports.csv` and `reference_labels.csv` in the same format).
