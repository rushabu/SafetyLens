# SafetyLens — demo video script (about 3 minutes)

A screen recording that shows every feature once. Read the **Say** column as voice-over; do what the **Do** column says.

## Before you record
1. Start with an empty database so the upload step is real:
   - Docker: `docker compose down -v` then `docker compose up --build` → open http://localhost:8080
   - or local: stop the API, delete `data/db/safetylens.db`, start the API and `npm run dev` → open http://localhost:5173
2. Download the two demo files from **Upload & Analyse** (`sample_messy.csv`, `synthetic_reports.csv`) so they are ready to drag in.
3. Browser at 100% zoom, full screen, light theme. Close other tabs and notifications.
4. Keep this manual-entry text on your clipboard:
   `The work permit had expired but the crew continued painting the ground-level handrail at the pump house for 20 minutes.`

## Shot list

| # | Time | Do | Say |
|---|---|---|---|
| 1 | 0:00 | Open the landing page and let the landscape animation finish. Scroll slowly to "The problem". | "Oil India collects thousands of unsafe-act, unsafe-condition and near-miss reports. They are reviewed by hand every month or quarter, but only about one in four or five carries real fatal potential. SafetyLens finds those reports as they arrive." |
| 2 | 0:20 | Click **Analyse reports**. Drag in `sample_messy.csv`. Point at the validation preview. | "Before anything is stored, we validate the file: an empty row is rejected, an exact duplicate is skipped, a bad date is kept as unknown." |
| 3 | 0:35 | Drag in `synthetic_reports.csv`, keep **Rule-based baseline**, click **Import 278 rows & analyse**. Show the progress bar finishing. | "This is our synthetic demo set of 278 reports. The default engine is rule-based, so it runs fully offline. Progress is saved on the server, so a refresh or restart never loses work." |
| 4 | 0:50 | Go to **Overview**. Set **Data → Include synthetic**. Hover the stat tiles. | "The dashboard shows the reported SIF-precursor density with its numerator and denominator. Reports without enough information are counted separately. They are not treated as safe." |
| 5 | 1:05 | Scroll to **Where to focus**, then the two ranking tables. Pick one site in the Site filter, then reset. | "This is the answer to the problem statement: sites and activities ranked by SIF-precursor density, with a 95% range. Small samples are listed but not ranked. Every chart follows the same filters." |
| 6 | 1:25 | Go to **Reports**, search `SYN-0001`, open it. Hover the highlighted text and the facts. | "A fitter walked under a suspended load. SafetyLens flags SIF potential because all three pillars are present: a serious harm mechanism, a person exposed, and a failed barrier. Each one is highlighted in the original text." |
| 7 | 1:45 | Back, search `SYN-0007`, open it. | "Same hazard, different outcome: the damaged sling was quarantined before the lift. The barrier worked, so this is non-SIF." |
| 8 | 1:55 | Scroll to **IOGP Life-Saving Rules** on a report (e.g. `SYN-0024`). | "Each report is mapped to the IOGP Life-Saving Rules, here Energy Isolation, with whether the rule was breached or the control was in place." |
| 9 | 2:05 | Open `SYN-0145` (vague report), show the facts-needed list. Then open `SYN-0164` and show the warning banner. | "When a report is too vague, SafetyLens says so and lists what to ask. And if a report contains text like 'ignore previous instructions', it is flagged and has no effect." |
| 10 | 2:20 | On any report, fill the **Review** form: change a value, add a note and your name, submit. Show the history. | "A safety professional confirms or corrects every call. The model's output and each review are kept in an append-only history." |
| 11 | 2:35 | **Upload & Analyse → Manual entry**: paste the clipboard text, submit, open the result. | "A single report can be typed in. Here the permit had expired, so Work Authorisation is breached, but there is no serious hazard, so it is not forced into SIF." |
| 12 | 2:45 | **Patterns**: show the top pattern, switch **Group by** to location, expand one row. | "Patterns show recurring combinations of activity, location and failed barrier, each linked to the reports behind it." |
| 13 | 2:55 | **Reports**: sort by **Triage priority**, click **Export CSV**. Then open **Evaluation** briefly. | "Reviewers get a triage queue with unreviewed SIF reports first, and everything exports to CSV. Our evaluation is on synthetic data and labelled as illustrative." |
| 14 | 3:05 | Toggle dark mode, return to the landing page. | "SafetyLens: read every near miss for what it could have been." |

## Optional extra (only if `key.txt` is set up and the Groq quota is free)
After shot 6: on `SYN-0001`, under **Analysis versions**, choose **LLM** and click **Re-analyse**. Say: "An optional LLM engine gives a second opinion. Its output is checked against the report text, and it never replaces the first analysis silently." It takes about 10–30 seconds, so cut the wait in editing.

## Tips
- Target 3 minutes; cut shots 9 and 13 first if you need to shorten.
- Record at 1080p. Move the mouse slowly and pause one second on each result.
- Say once, near the start or end: "All data shown is synthetic."
