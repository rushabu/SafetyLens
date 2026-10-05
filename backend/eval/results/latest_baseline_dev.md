# SafetyLens evaluation - baseline on `dev` split

> **SYNTHETIC / ILLUSTRATIVE: author-assigned labels on generator-produced reports; not expert validated; not representative of OIL data.**

- Engine: `baseline-v1.0.0+baseline-lexicon-v1.0.0`  Model: `None`  Prompt: `None`
- Rubric: `rubric-v1.0.0-proposed`  Taxonomy: `taxonomy-v1.0.0`  Run: 2026-10-01T12:09:53.898766+00:00
- Cases: 181  Processing failures: 0

## SIF potential
- Precision 1.0, end-to-end recall 0.9245, F1 0.9608 (recall on answered cases 1.0)
- Capture of reference-SIF cases: {'reference_sif': 53, 'captured': 49, 'abstained': 4, 'missed_as_non_sif': 0, 'errored': 0}
- Abstention rate 0.453, coverage 0.547
- Three-class accuracy 0.6685

| reference \ output | SIF | NON_SIF | INSUFFICIENT | ERROR |
|---|---|---|---|---|
| SIF_POTENTIAL | 49 | 0 | 4 | 0 |
| NON_SIF_POTENTIAL | 0 | 50 | 56 | 0 |
| INSUFFICIENT_INFORMATION | 0 | 0 | 22 | 0 |

## Life-Saving Rule tagging (multi-label)
- Micro P/R/F1: 0.9758 / 0.8705 / 0.9202; macro F1 0.9245; exact tag-set match 0.884

| rule | support | precision | recall | F1 |
|---|---|---|---|---|
| LSR-01 | 4 | 1.0 | 1.0 | 1.0 |
| LSR-02 | 9 | 1.0 | 1.0 | 1.0 |
| LSR-03 | 16 | 1.0 | 0.5 | 0.6667 |
| LSR-04 | 13 | 1.0 | 1.0 | 1.0 |
| LSR-05 | 11 | 1.0 | 1.0 | 1.0 |
| LSR-06 | 19 | 1.0 | 0.6316 | 0.7742 |
| LSR-07 | 19 | 0.8636 | 1.0 | 0.9268 |
| LSR-08 | 15 | 1.0 | 1.0 | 1.0 |
| LSR-09 | 33 | 1.0 | 0.9091 | 0.9524 |

## Evidence and latency
- Evidence spans checked 882, valid 882 (rate 1.0); invalid quotes removed by validator: 0
- Latency ms: mean 1.1657, p50 1, p95 2
