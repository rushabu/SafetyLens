# SafetyLens explained — a beginner's guide

This guide assumes no background in oil and gas, safety management or AI. For the technical version, see
[PROJECT.md](PROJECT.md).

---

## 1. The one-minute version

Workers at oil and gas sites write short reports whenever they see something unsafe. A company like Oil India Limited (OIL)
receives thousands of them. Most describe small things, such as a wet floor or a missing glove. A few describe situations that
could have killed someone, such as a person walking under a crane's load.

Today people read these reports by hand, once a month or once a quarter. The dangerous few are easy to miss among the many.

**SafetyLens is software that reads every report as it arrives, picks out the ones that could have been fatal, shows why, and
tells managers which sites and activities need attention first.** A human safety officer still makes the final call.

## 2. Words you need to know

| Term | Plain meaning |
|---|---|
| **Unsafe act (UA)** | Someone doing something risky, e.g. working at height without a harness |
| **Unsafe condition (UC)** | Something risky in the workplace, e.g. a broken guard rail |
| **Near miss** | An event where nobody was hurt, but easily could have been |
| **SIF** | Serious Injury or Fatality: a life-changing injury or a death |
| **SIF precursor** | A situation that could lead to a SIF if nothing changes |
| **Barrier (or control)** | Anything that stops harm: a harness, a lock on a power switch, a barricade, a work permit, a gas test |
| **HSE** | Health, Safety and Environment: the department responsible for safety |
| **IOGP Life-Saving Rules** | Nine simple rules, written by the international oil and gas industry body, that cover the activities which kill most often |
| **NLP** | Natural Language Processing: software that reads ordinary written text |
| **LLM** | Large Language Model: the kind of AI behind chat assistants |

## 3. The problem, in more detail

**Small accidents and fatal accidents have different causes.** For years, companies assumed that reducing minor injuries would
automatically reduce deaths. The data says otherwise: over 15 years in the US, non-fatal accidents fell by 51%, but fatalities
fell by only 25.5%. Slips and cut fingers are not smaller versions of a crane accident.

**Only about 20–25% of reports carry real fatal potential.** Leading companies now flag that minority separately, so their
effort goes where lives are at stake.

**Reading by hand is slow.** If reports are reviewed every quarter, a serious warning can sit unread for weeks.

**What Oil India asked for** (Problem Statement 26165): a working prototype that

1. reads free-text safety reports and classifies each as SIF-potential or not;
2. tags each report to the relevant Life-Saving Rule;
3. shows recurring patterns (which activity, which location, which barrier failed) on a dashboard;
4. ranks sites and activities by how concentrated the SIF precursors are.

## 4. The key idea: judge what *could* have happened

Compare two reports:

> **A.** "A worker slipped on the wet floor and bruised his elbow."
>
> **B.** "A fitter walked under the suspended load to guide it by hand. No injury."

Report A has an injury. Report B has none. But B is far more dangerous: if the load had dropped, the fitter would have died.
SafetyLens judges **potential** severity, not what actually happened.

## 5. How SafetyLens decides: three questions

SafetyLens flags a report as **SIF potential** only if the report itself answers "yes" to all three:

1. **Is there something that could kill or seriously injure?** A fall from height, a suspended load, electricity, toxic gas, a
   moving vehicle, fire, stored pressure.
2. **Was a person exposed to it?** Someone was in the danger zone, or close to it.
3. **Did a safety barrier fail?** The barricade was missing, the harness was not clipped, the machine was not locked off.

Applied to report B: a suspended load (yes), a fitter underneath (yes), no exclusion zone kept (yes). So it is SIF potential.

There are three possible answers, not two:

| Answer | Meaning |
|---|---|
| **SIF potential** | All three questions are answered yes by the report |
| **Non-SIF** | The report is clear, and the hazard is minor, or nobody was exposed, or the safety controls worked |
| **Insufficient information** | The report is too vague or contradicts itself. SafetyLens lists what the supervisor should find out |

The third answer matters. A report that says only "unsafe condition near the tank area" could be anything. Guessing "safe" would
be dangerous, and guessing "SIF" would waste effort. So SafetyLens says it does not know, and asks.

## 6. The nine Life-Saving Rules

SafetyLens also tags each report with the rules it relates to, and whether the rule was **breached** or the control was **in place**.

| Rule | Example of a breach |
|---|---|
| Bypassing Safety Controls | A gas alarm was switched off to stop it beeping |
| Confined Space | Someone entered a tank without a gas test |
| Driving | No seat belt, or speeding on a site road |
| Energy Isolation | A pump started while someone was repairing it |
| Hot Work | Welding next to flammable material with no fire watch |
| Line of Fire | Standing under a suspended load or behind a reversing truck |
| Safe Mechanical Lifting | Lifting with a damaged sling or no lift plan |
| Work Authorisation | Working after the permit expired |
| Working at Height | No harness on a scaffold |

A rule breach is not automatically a SIF. An expired permit for painting a ground-level handrail breaks Work Authorisation, but
nothing there can kill anyone. SafetyLens keeps the two judgements separate.

## 7. What using it looks like

1. **Upload.** An HSE officer uploads a spreadsheet (CSV) of reports, or types one in. SafetyLens checks the file first: empty rows
   are rejected and duplicates are skipped.
2. **Analyse.** Each report is read and assessed in the background. A progress bar shows how far it has got.
3. **Overview dashboard.** Shows how many reports were flagged, which sites and activities have the highest share of SIF reports,
   and a "Where to focus" list.
4. **Report page.** Shows the original text with coloured highlights on the exact words behind each conclusion: the hazard, the
   person exposed, the failed barrier.
5. **Review.** The officer confirms or corrects the assessment and adds a note. Nothing is overwritten; the full history is kept.
6. **Patterns.** Shows combinations that keep recurring, such as "work at height → fall hazard → no fall protection", and at
   which site.
7. **Export.** Everything can be downloaded as a spreadsheet.

## 8. How it works inside (no maths)

SafetyLens has two "engines" that read reports. Both produce the same kind of answer.

**Engine 1: rule-based (the default).** A carefully written dictionary of words and phrases, plus logic that understands:

- **negation**: "no harness" means the barrier failed, but "no issues with the harness" does not;
- **what actually happened versus what might have**: "the load could fall" is a worry, "the load fell" is an event;
- **past stories**: "last year someone fell here" is history, not today's event.

It needs no internet and no AI service, and it gives the same answer every time. Its weakness is wording it has never seen. When
that happens it says "insufficient information" instead of guessing.

**Engine 2: an LLM (optional).** A large AI model that copes better with unusual wording. Because such models can make things
up, SafetyLens fences it in:

- it must answer in a fixed form, choosing only from known rules and categories;
- every quote it gives is checked against the original report, and quotes that are not really there are thrown away;
- if its answer is still invalid after a few tries, the report is marked as a **processing error**, never as "safe";
- by default, only synthetic (made-up) reports may be sent to an outside AI service. Real reports stay inside the company unless
  someone deliberately allows it.

## 9. Why you can trust what it shows

- **Evidence for everything.** Each conclusion points to exact words in the report.
- **It admits uncertainty.** It abstains instead of guessing.
- **Failures are visible.** If something goes wrong, the report is shown as an error.
- **Humans decide.** Reviewers can overrule it, and both versions are kept.
- **Honest numbers.** The dashboard shows "76 of 164", not just a percentage, and refuses to rank sites with too few reports.
- **No fake precision.** It never shows a "probability of fatality" figure.

## 10. How well does it work?

We had no access to real Oil India reports, so we wrote 278 **synthetic** (made-up but realistic) reports and labelled them
ourselves. On the held-out test portion, the rule-based engine:

- never called a SIF report "safe";
- was right every time it said "SIF" (precision 1.00);
- found 82% of the SIF reports, and abstained on the rest.

These numbers are **illustrative only**. Real reports are messier than ours, and we wrote both the reports and the labels. The
honest next step is to test on real reports labelled by OIL's own safety experts. Details are in [EVALUATION.md](EVALUATION.md).

## 11. What it does not do (yet)

- It has not been tested on real Oil India data.
- Its definition of SIF is our proposal, and still needs OIL's agreement.
- It has no login system; reviewers just type their name.
- It reads English only.
- It is a prototype for one team, not yet built for hundreds of simultaneous users.

## 12. What it is built with

| Part | Technology | In plain words |
|---|---|---|
| Screen you see | React + TypeScript | The web pages and charts |
| Engine room | Python + FastAPI | Receives reports, runs the analysis, answers the web pages |
| Storage | SQLite | A single-file database holding reports, analyses and reviews |
| Knowledge | YAML files | Editable text files containing the SIF definition, the nine rules and the phrase dictionary |
| Packaging | Docker | One command starts everything on any computer |

## 13. Where to go next

- Try it: follow the Quick start in the [README](../README.md), then the five-minute tour in [DEMO.md](DEMO.md).
- Full technical description: [PROJECT.md](PROJECT.md).
- The SIF definition in detail: [RUBRIC.md](RUBRIC.md).
- Test results: [EVALUATION.md](EVALUATION.md).
- Recording the demo video: [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md).
