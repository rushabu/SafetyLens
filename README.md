# SafetyLens

**AI/NLP engine to detect Serious Injury & Fatality (SIF) precursors in unsafe-act / unsafe-condition and near-miss reports**
— hackathon prototype for Problem Statement 26165.

SafetyLens ingests free-text safety reports, assesses **SIF potential**, maps relevant **IOGP Life-Saving Rules**, extracts
evidence-backed precursor facts (activity, harm mechanism, exposure, barriers, missing information), supports **human review**
with an append-only audit trail, and shows **recurring patterns** across sites and activities.

> **Prototype status.** The SIF rubric is a *proposed* prototype awaiting alignment with OIL's domain definition. The bundled
> dataset is **synthetic**; all evaluation numbers are illustrative and say nothing about performance on OIL data. The default
> engine is a transparent **rule-based baseline**, not a trained model.

---

## What it does

| Area | Implemented |
|---|---|
| Ingestion | CSV upload with a validation preview (column mapping, rejected rows, exact duplicates, probable near-duplicates), downloadable template, manual entry, idempotent re-import, synthetic/operational provenance |
| Processing | Application-owned background worker backed by the database; persistent progress; explicit failed-row list with retry; jobs interrupted by a restart become *interrupted* and are resumed explicitly — completed analyses are never re-run by a page refresh |
| Assessment | `SIF_POTENTIAL` / `NON_SIF_POTENTIAL` / `INSUFFICIENT_INFORMATION` (abstention, with the facts needed). Engine failures are stored as `PROCESSING_ERROR` and never counted as non-SIF |
| Rules | Multi-label tagging of LSR-01…LSR-09 with relevance, breach / control / unclear status, exact evidence and an explanation; other hazards kept separate |
| Evidence | Every quote is verified against the original text (offsets repaired if needed; unfound quotes removed and never shown as support); highlights are exact character spans |
| Review | Reviewer confirm/correct of assessment and rule tags with notes; append-only history with timestamp and identity; model output preserved; re-analysis creates a new version |
| Analytics | Sites and activities **ranked by reported SIF-precursor density** (or SIF count / volume) with numerator/denominator and a 95% range; groups below the sample threshold are listed but not ranked; a *Where to focus* list of site × activity combinations with their dominant failed barriers and rules; abstentions, failures, volume; model-assessed vs reviewer-confirmed views; time/site/activity/data filters shared by every chart, table, pattern list and export |
| Patterns | Recurring precursor patterns by deterministic grouping of normalised categories — activity → mechanism → failed barrier, or location (site) → activity / mechanism → failed barrier; every pattern links to its supporting reports |
| Triage | Reports can be sorted by triage priority (unreviewed SIF first, then abstentions) so HSE no longer waits for a monthly/quarterly review cycle |
| Export | CSV of the filtered reports with analysis, versions and latest review (formula-injection safe) |
| Evaluation | Reproducible runner: SIF P/R/F1, confusion matrix, abstention & coverage, end-to-end capture of reference-SIF cases, multi-label micro/macro F1 + per-rule, evidence-span validity, latency, failures |

Screens: **Landing page (`/`) · Overview (`/overview`) · Upload & Analyse · Reports · Report Detail / Review · Patterns · Evaluation · Method & Taxonomy**.

---

## Quick start (local, no API key)

Prerequisites: **Python 3.11+** and **Node 20+**.

### 1. Backend (terminal 1)

Windows (PowerShell):
```powershell
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m seed.generate_synthetic --seed 42
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

macOS / Linux:
```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m seed.generate_synthetic --seed 42
.venv/bin/python -m uvicorn app.main:app --port 8000
```

The API is at http://127.0.0.1:8000 (OpenAPI docs at `/docs`). The SQLite database is created at `data/db/safetylens.db`.
The synthetic data files are already committed; re-running the generator reproduces them byte-for-byte.

### 2. Frontend (terminal 2)
```bash
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173**. If the API runs on another port, start the dev server with `VITE_API_PROXY=http://127.0.0.1:<port>`.

### 3. Try it
1. **Upload & Analyse** → click the `synthetic_reports.csv` demo link to download it, then drop it on the upload area. The file is
   recognised as synthetic. Click **Import 278 rows & analyse**.
2. **Overview** → set *Data* to **Include synthetic** (synthetic data is excluded from operational views by default).
3. Open a report from **Reports**, inspect the highlighted evidence, and submit a review.

See [docs/DEMO.md](docs/DEMO.md) for a five-minute walkthrough and [docs/PROJECT.md](docs/PROJECT.md) for the complete project document.

### Single-process production mode (optional)
```bash
cd frontend && npm run build && cd ../backend
STATIC_DIR=../frontend/dist .venv/bin/python -m uvicorn app.main:app --port 8000   # PowerShell: $env:STATIC_DIR="../frontend/dist"
```
The API then also serves the built UI at http://127.0.0.1:8000.

---

## Docker Compose
```bash
docker compose up --build
```
With the LLM engine (key read from `./key.txt` as a Docker secret, settings from `.env`):
```bash
docker compose -f docker-compose.yml -f docker-compose.llm.yml up --build
```
Open **http://localhost:8080**. The API container keeps the database in the named volume `safetylens-db`, so data and review
history survive `docker compose down` / `up` (use `docker compose down -v` to wipe it). An optional `.env` file in the repo root is
passed to the API container.

---

## Configuration and the optional LLM engine

Copy `.env.example` to `.env` (repo root or `backend/`). With no changes, SafetyLens runs in **baseline mode**.

| Variable | Meaning |
|---|---|
| `LLM_PROVIDER` | `none` (default), `anthropic`, or `openai_compatible` (Ollama, vLLM, LM Studio, other gateways) |
| `LLM_MODEL`, `LLM_API_KEY`, `LLM_BASE_URL` | Model and credentials. Read only by the backend; never returned by any API or included in the browser bundle |
| `LLM_API_KEY_FILE` | Alternative to `LLM_API_KEY`: a file containing only the key (e.g. `key.txt`, gitignored and excluded from Docker images) |
| `LLM_PROMPT_VERSION` | `prompt-v1.2.0` (default, tuned on the dev split) or `prompt-v1.1.0`, for A/B evaluation |
| `LLM_EXTRA_BODY` | Optional JSON merged into OpenAI-compatible requests, e.g. `{"reasoning_effort": "medium"}` for Groq's `openai/gpt-oss-120b` |
| `LLM_DATA_POLICY` | `synthetic_only` (default): a non-local endpoint may only receive reports labelled synthetic. `all`: explicit opt-in for real data |
| `LLM_MAX_RETRIES`, `LLM_TIMEOUT_S` | Bounded retries; after the last failure the report is stored as `PROCESSING_ERROR` |
| `LLM_EFFORT`, `LLM_ANTHROPIC_FALLBACKS` | Anthropic only. Fallbacks let the API re-run a refused request on a fallback model; the model that actually served the request is recorded with the analysis |

How the LLM adapter is constrained:
- Report text is wrapped as delimited, untrusted data; the prompt instructs the model never to follow embedded instructions. The
  engine has **no tools**.
- Output must match a JSON schema (enum-constrained rule IDs and categories). It is then validated again server-side; every quote
  must exist in the original text, and an `SIF_POTENTIAL` answer must have valid evidence for mechanism, exposure and a failed
  critical barrier.
- Invalid output triggers a bounded, append-only repair turn; persistent failure → `PROCESSING_ERROR`. **There is no silent fallback
  to the baseline.** Each batch records the engine chosen at start.
- No confidence percentages are requested or displayed; evidence sufficiency is qualitative (strong / moderate / limited / insufficient).

---

## Tests and evaluation

```bash
cd backend
.venv/Scripts/python -m pytest            # Windows; use .venv/bin/python on macOS/Linux
.venv/Scripts/python -m eval.run_eval --engine baseline --split test
.venv/Scripts/python -m eval.run_eval --engine llm --split test --limit 20   # only when an LLM is configured
```

48 tests cover CSV validation and duplicates, negation and effective controls, modality, invalid or unsupported LLM output,
exact evidence validation, multi-label tagging, failed analyses never becoming non-SIF, review history, analytics denominators
and filters, evaluation-data separation, the external-data policy, CSV export and restart recovery.

Evaluation results are written to `backend/eval/results/` and shown on the **Evaluation** page. Current baseline results are in
[docs/EVALUATION.md](docs/EVALUATION.md) — **synthetic and illustrative only**.

---

## Repository layout

```
backend/
  app/
    knowledge/        taxonomy_v1.yaml, rubric_v1.yaml (proposed), baseline_lexicon_v1.yaml, loader.py
    analysis/         baseline.py, text_utils.py, validation.py, registry.py, llm/ (prompt, engine, providers)
    ingestion/        csv_import.py      services/  imports, persist, query, analytics, patterns, export, reviews
    api/              REST routes        worker.py  DB-backed job queue      models.py  SQLAlchemy tables
  seed/generate_synthetic.py   eval/run_eval.py   tests/
frontend/             React + TypeScript (Vite, TanStack Query, Recharts, Tailwind)
data/                 synthetic/ (reports + separate reference labels), sample_messy.csv, sample_template.csv
docs/                 PROJECT.md (full project document), EXPLAINER.md (beginner guide), DEMO.md, VIDEO_SCRIPT.md, RUBRIC.md, EVALUATION.md
docker-compose.yml  .env.example
```

## Data model (SQLite)
`batches` · `reports` (original text, metadata, provenance, near-duplicate link) · `import_row_issues` · `analysis_jobs` ·
`analyses` (versioned; engine, model, prompt, rubric and taxonomy versions; status; validated output; raw provider output) ·
`extracted_facts` · `rule_tags` · `evidence_spans` · `reviews` (append-only) · `eval_reference_labels` and `eval_runs`
(evaluation only; never read by analysis code — enforced by a test).

## Analytics definitions
- **Reported SIF precursor density** = SIF_POTENTIAL reports ÷ reports with a determinate assessment (SIF + NON_SIF).
  It is report-based, depends on reporting culture and volume, and is **not** an exposure-adjusted risk rate.
- `INSUFFICIENT_INFORMATION` is an abstention and is never in the denominator; processing failures and pending jobs are shown separately.
- **Model-assessed** view uses each report's current analysis. **Reviewer-confirmed** view uses the latest review per report;
  unreviewed reports count as backlog, never imputed.
- Exact duplicates (same text after whitespace/case normalisation) are never imported. Probable near-duplicates (token-sort
  similarity ≥ 92 with no conflicting site/date) are imported and flagged; a filter toggle includes or excludes them.
- Groups with fewer than 10 determinate reports are flagged *small n*; tables are sorted by volume, not ranked by density.
- Rule charts are multi-label: tag counts can exceed report counts.

## Known limitations
- **Rubric and labels are not validated.** The rubric is a proposal; the synthetic labels are author-assigned. Alignment with
  OIL's SIF definition and an independently reviewed evaluation set are required before any operational use.
- **The baseline is pattern matching.** It handles common phrasings, negation and modality, but misses unseen wording (abstaining
  rather than guessing), and its lexicon was written alongside the synthetic generator, so its synthetic scores are optimistic.
  The held-out test split contains no LSR-09 scenario groups (the split is by scenario group).
- **LLM throughput on Groq's free tier is low.** `openai/gpt-oss-120b` is limited to 8,000 tokens/minute and 200,000 tokens/day
  (each analysis uses ~3.5–4.5k tokens), i.e. roughly 2 reports/minute and ~45 reports/day. When the quota is exhausted the
  report is stored as a `PROCESSING_ERROR` with the provider's message and can be retried later. Use the baseline for bulk demo
  imports, the LLM for individual re-analysis, or a paid tier / local model for volume. The LLM evaluation was therefore run on a
  stratified 39-report sample, not the full test split (see [docs/EVALUATION.md](docs/EVALUATION.md)).
- No authentication: reviewer identity is a typed name. Single-process SQLite worker; suitable for a prototype, not for concurrent multi-user production.
- Patterns use exact category matches; semantic similarity clustering is not implemented.


## Taxonomy source
IOGP Life-Saving Rules — https://www.iogp.org/workstreams/safety/safety/life-savingrules/ and
https://www.iogp.org/wp-content/uploads/2018/08/Life-SavingRules-WorkCard.pdf. SafetyLens uses the rule IDs and text labels only;
scope notes are its own paraphrases. Official icons and statements are not reproduced.
