# SafetyLens evaluation - baseline on `test` split

> **SYNTHETIC / ILLUSTRATIVE: author-assigned labels on generator-produced reports; not expert validated; not representative of OIL data.**

- Engine: `baseline-v1.0.0+baseline-lexicon-v1.0.0`  Model: `None`  Prompt: `None`
- Rubric: `rubric-v1.0.0-proposed`  Taxonomy: `taxonomy-v1.0.0`  Run: 2026-10-01T12:09:52.495293+00:00
- Cases: 97  Processing failures: 0

## SIF potential
- Precision 1.0, end-to-end recall 0.8182, F1 0.9 (recall on answered cases 1.0)
- Capture of reference-SIF cases: {'reference_sif': 33, 'captured': 27, 'abstained': 6, 'missed_as_non_sif': 0, 'errored': 0}
- Abstention rate 0.3299, coverage 0.6701
- Three-class accuracy 0.7526

| reference \ output | SIF | NON_SIF | INSUFFICIENT | ERROR |
|---|---|---|---|---|
| SIF_POTENTIAL | 27 | 0 | 6 | 0 |
| NON_SIF_POTENTIAL | 0 | 38 | 18 | 0 |
| INSUFFICIENT_INFORMATION | 0 | 0 | 8 | 0 |

## Life-Saving Rule tagging (multi-label)
- Micro P/R/F1: 0.8452 / 0.9861 / 0.9103; macro F1 0.9496; exact tag-set match 0.8557

| rule | support | precision | recall | F1 |
|---|---|---|---|---|
| LSR-01 | 3 | 1.0 | 1.0 | 1.0 |
| LSR-02 | 3 | 1.0 | 1.0 | 1.0 |
| LSR-03 | 5 | 1.0 | 1.0 | 1.0 |
| LSR-04 | 9 | 1.0 | 1.0 | 1.0 |
| LSR-05 | 2 | 1.0 | 0.5 | 0.6667 |
| LSR-06 | 24 | 1.0 | 1.0 | 1.0 |
| LSR-07 | 20 | 0.8696 | 1.0 | 0.9302 |
| LSR-08 | 6 | 1.0 | 1.0 | 1.0 |
| LSR-09 | 0 | 0.0 | None | None |

## Evidence and latency
- Evidence spans checked 524, valid 524 (rate 1.0); invalid quotes removed by validator: 0
- Latency ms: mean 1.4948, p50 1, p95 2
