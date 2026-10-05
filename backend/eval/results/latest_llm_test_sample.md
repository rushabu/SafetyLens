# SafetyLens evaluation - llm on `test (sample: 2 per scenario group)` split

> **SYNTHETIC / ILLUSTRATIVE: author-assigned labels on generator-produced reports; not expert validated; not representative of OIL data.**

- Engine: `llm-adapter-v1.0.0+schema-cdea7701452d`  Model: `openai_compatible:openai/gpt-oss-20b`  Prompt: `prompt-v1.1.0`
- Rubric: `rubric-v1.0.0-proposed`  Taxonomy: `taxonomy-v1.0.0`  Run: 2026-10-01T13:45:48.442643+00:00
- Cases: 39  Processing failures: 1

## SIF potential
- Precision 1.0, end-to-end recall 0.75, F1 0.8571 (recall on answered cases 1.0)
- Capture of reference-SIF cases: {'reference_sif': 12, 'captured': 9, 'abstained': 3, 'missed_as_non_sif': 0, 'errored': 0}
- Abstention rate 0.5385, coverage 0.4359
- Three-class accuracy 0.5385

| reference \ output | SIF | NON_SIF | INSUFFICIENT | ERROR |
|---|---|---|---|---|
| SIF_POTENTIAL | 9 | 0 | 3 | 0 |
| NON_SIF_POTENTIAL | 0 | 8 | 14 | 1 |
| INSUFFICIENT_INFORMATION | 0 | 0 | 4 | 0 |

## Life-Saving Rule tagging (multi-label)
- Micro P/R/F1: 1.0 / 0.5588 / 0.717; macro F1 0.6452; exact tag-set match 0.6667

| rule | support | precision | recall | F1 |
|---|---|---|---|---|
| LSR-01 | 2 | None | 0.0 | None |
| LSR-02 | 2 | 1.0 | 0.5 | 0.6667 |
| LSR-03 | 2 | 1.0 | 1.0 | 1.0 |
| LSR-04 | 4 | 1.0 | 1.0 | 1.0 |
| LSR-05 | 2 | 1.0 | 0.5 | 0.6667 |
| LSR-06 | 10 | 1.0 | 0.4 | 0.5714 |
| LSR-07 | 8 | 1.0 | 0.75 | 0.8571 |
| LSR-08 | 4 | 1.0 | 0.25 | 0.4 |
| LSR-09 | 0 | None | None | None |

## Evidence and latency
- Evidence spans checked 148, valid 148 (rate 1.0); invalid quotes removed by validator: 0
- Latency ms: mean 27707.7692, p50 30508, p95 34651
