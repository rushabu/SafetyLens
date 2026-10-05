# SafetyLens evaluation - llm on `dev (sample: 1 per scenario group)` split

> **SYNTHETIC / ILLUSTRATIVE: author-assigned labels on generator-produced reports; not expert validated; not representative of OIL data.**

- Engine: `llm-adapter-v1.0.0+schema-cdea7701452d`  Model: `openai_compatible:qwen/qwen3.8-27b`  Prompt: `prompt-v1.2.0`
- Rubric: `rubric-v1.0.0-proposed`  Taxonomy: `taxonomy-v1.0.0`  Run: 2026-10-01T14:30:11.206342+00:00
- Cases: 36  Processing failures: 14

## SIF potential
- Precision 1.0, end-to-end recall 0.9167, F1 0.9565 (recall on answered cases 1.0)
- Capture of reference-SIF cases: {'reference_sif': 12, 'captured': 11, 'abstained': 0, 'missed_as_non_sif': 0, 'errored': 1}
- Abstention rate 0.0556, coverage 0.5556
- Three-class accuracy 0.6111

| reference \ output | SIF | NON_SIF | INSUFFICIENT | ERROR |
|---|---|---|---|---|
| SIF_POTENTIAL | 11 | 0 | 0 | 1 |
| NON_SIF_POTENTIAL | 0 | 9 | 0 | 11 |
| INSUFFICIENT_INFORMATION | 0 | 0 | 2 | 2 |

## Life-Saving Rule tagging (multi-label)
- Micro P/R/F1: 0.9231 / 0.75 / 0.8276; macro F1 0.8487; exact tag-set match 0.5

| rule | support | precision | recall | F1 |
|---|---|---|---|---|
| LSR-01 | 1 | 1.0 | 1.0 | 1.0 |
| LSR-02 | 3 | 0.75 | 1.0 | 0.8571 |
| LSR-03 | 3 | 1.0 | 0.6667 | 0.8 |
| LSR-04 | 3 | 0.6667 | 0.6667 | 0.6667 |
| LSR-05 | 3 | 1.0 | 1.0 | 1.0 |
| LSR-06 | 4 | 1.0 | 0.75 | 0.8571 |
| LSR-07 | 4 | 1.0 | 0.75 | 0.8571 |
| LSR-08 | 4 | 1.0 | 1.0 | 1.0 |
| LSR-09 | 7 | 1.0 | 0.4286 | 0.6 |

## Evidence and latency
- Evidence spans checked 161, valid 161 (rate 1.0); invalid quotes removed by validator: 0
- Latency ms: mean 24019.0833, p50 18236.0, p95 72915
