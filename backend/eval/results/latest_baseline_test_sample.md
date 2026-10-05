# SafetyLens evaluation - baseline on `test (sample: 2 per scenario group)` split

> **SYNTHETIC / ILLUSTRATIVE: author-assigned labels on generator-produced reports; not expert validated; not representative of OIL data.**

- Engine: `baseline-v1.0.0+baseline-lexicon-v1.0.0`  Model: `None`  Prompt: `None`
- Rubric: `rubric-v1.0.0-proposed`  Taxonomy: `taxonomy-v1.0.0`  Run: 2026-10-01T12:18:47.168918+00:00
- Cases: 39  Processing failures: 0

## SIF potential
- Precision 1.0, end-to-end recall 0.8333, F1 0.9091 (recall on answered cases 1.0)
- Capture of reference-SIF cases: {'reference_sif': 12, 'captured': 10, 'abstained': 2, 'missed_as_non_sif': 0, 'errored': 0}
- Abstention rate 0.3077, coverage 0.6923
- Three-class accuracy 0.7949

| reference \ output | SIF | NON_SIF | INSUFFICIENT | ERROR |
|---|---|---|---|---|
| SIF_POTENTIAL | 10 | 0 | 2 | 0 |
| NON_SIF_POTENTIAL | 0 | 17 | 6 | 0 |
| INSUFFICIENT_INFORMATION | 0 | 0 | 4 | 0 |

## Life-Saving Rule tagging (multi-label)
- Micro P/R/F1: 0.9429 / 0.9706 / 0.9565; macro F1 0.9583; exact tag-set match 0.9231

| rule | support | precision | recall | F1 |
|---|---|---|---|---|
| LSR-01 | 2 | 1.0 | 1.0 | 1.0 |
| LSR-02 | 2 | 1.0 | 1.0 | 1.0 |
| LSR-03 | 2 | 1.0 | 1.0 | 1.0 |
| LSR-04 | 4 | 1.0 | 1.0 | 1.0 |
| LSR-05 | 2 | 1.0 | 0.5 | 0.6667 |
| LSR-06 | 10 | 1.0 | 1.0 | 1.0 |
| LSR-07 | 8 | 1.0 | 1.0 | 1.0 |
| LSR-08 | 4 | 1.0 | 1.0 | 1.0 |
| LSR-09 | 0 | 0.0 | None | None |

## Evidence and latency
- Evidence spans checked 226, valid 226 (rate 1.0); invalid quotes removed by validator: 0
- Latency ms: mean 2.4103, p50 1, p95 2
