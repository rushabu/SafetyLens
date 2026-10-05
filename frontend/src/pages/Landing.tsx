import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpenCheck, ClipboardCheck, ExternalLink, FileSearch, FlaskConical, Layers, Moon, Network, ScanSearch, ShieldCheck, Sun, Upload, UserCheck, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Ornament, Wordmark } from "../components/Brand";
import EngravedLandscape from "../components/EngravedLandscape";
import { AssessmentBadge, cx } from "../components/ui";
import { AnimatedValue, Reveal } from "../components/motion";
import { useMeta } from "../lib/queries";
import { useTheme } from "../lib/theme";

const ALL = "source_type=operational&source_type=manual&source_type=synthetic&include_near_duplicates=true&view=model";

function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <Reveal className="mx-auto mb-10 max-w-2xl text-center">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</div>
      <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink md:text-[2.4rem] md:leading-tight">{title}</h2>
      <Ornament className="mx-auto mt-4" />
      {children && <p className="mt-4 text-[15px] leading-relaxed text-ink-2">{children}</p>}
    </Reveal>
  );
}

function LiveStats() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["overview", "landing", ALL], queryFn: () => api.overview(ALL) });
  if (isError) return null;
  const s = data?.summary;
  const syn = data?.meta.synthetic_in_db ?? 0;
  const items = [
    { label: "Reports analysed", value: s ? s.reporting_volume - (s.pending ?? 0) : null },
    { label: "Flagged SIF potential", value: s ? `${s.sif}` : null, sub: s && s.determinate ? `of ${s.determinate} determinate` : undefined },
    { label: "Abstained — facts needed", value: s ? s.insufficient : null },
    { label: "Awaiting human review", value: data ? data.backlog.unreviewed_completed : null },
  ];
  return (
    <div className="rise relative z-10 mx-auto -mt-10 max-w-5xl px-4" style={{ "--d": "700ms" } as React.CSSProperties}>
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_12px_40px_-18px_rgba(13,29,66,0.35)] md:grid-cols-4">
        {items.map((it, i) => (
          <div key={it.label} className={cx("px-5 py-4", i > 0 && "border-l border-line", i === 2 && "max-md:border-l-0 max-md:border-t", i === 3 && "max-md:border-t")}>
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-3">{it.label}</div>
            <div className="mt-1 font-display text-3xl font-semibold tabular text-ink">{isLoading ? "…" : <AnimatedValue value={it.value ?? "—"} />}</div>
            {it.sub && <div className="text-xs text-ink-3">{it.sub}</div>}
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-ink-3">
        Live from this installation{syn > 0 ? ` · includes ${syn} synthetic demo reports` : ""} · model-assessed, report-based counts
      </p>
    </div>
  );
}

const STEPS = [
  { Icon: Upload, title: "Ingest", text: "Upload a CSV export or type a report. A validation preview catches empty rows, duplicates and unparseable dates before anything is stored." },
  { Icon: ScanSearch, title: "Assess", text: "Each narrative is read for harm mechanism, exposure and barriers, then classed as SIF potential, non-SIF, or insufficient information — with exact quotes." },
  { Icon: UserCheck, title: "Review", text: "Safety professionals confirm or correct the assessment and Life-Saving Rule tags. Every decision is kept in an append-only audit trail." },
  { Icon: Network, title: "Learn", text: "Recurring activity → mechanism → failed-barrier patterns surface across sites and time, each linked to the reports behind it." },
];

const PRINCIPLES = [
  { title: "Potential, not outcome", text: "A no-injury near miss beside a suspended load can carry fatal potential. Actual injury severity never caps the assessment." },
  { title: "Silence is not failure", text: "A barrier is only marked failed when the report says so, or the event itself shows it. Unmentioned is unknown." },
  { title: "Abstain rather than guess", text: "When a pillar is missing or contradictory, SafetyLens says so and lists the facts a supervisor should add." },
  { title: "Evidence or it didn't happen", text: "Every claim is tied to an exact span of the original text. Quotes that cannot be found are discarded, never shown." },
];

export default function LandingPage() {
  const [theme, setTheme] = useTheme();
  const { data: meta } = useMeta();
  const rules = meta?.taxonomy.rules ?? [];

  return (
    <div className="min-h-screen bg-surface text-ink">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" aria-label="SafetyLens home">
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-1 text-sm" aria-label="Landing">
            <a href="#how" className="hidden rounded-lg px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink md:block">
              How it works
            </a>
            <Link to="/method" className="hidden rounded-lg px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink md:block">
              Method
            </Link>
            <Link to="/evaluation" className="hidden rounded-lg px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink md:block">
              Evaluation
            </Link>
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <Link to="/overview" className="group ml-1 inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[linear-gradient(180deg,var(--accent-2),var(--accent))] px-3.5 font-medium text-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:brightness-105">
              <span className="hidden sm:inline">Open</span> Dashboard <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: "linear-gradient(180deg, var(--surface) 0%, var(--hero-wash) 100%)" }}>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto max-w-[1500px]">
          <EngravedLandscape className="h-auto w-full" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-[min(46vw,560px)] pt-14 md:pb-[min(38vw,520px)] md:pt-20">
          <div className="max-w-xl">
            <div className="rise inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1 text-xs font-medium text-ink-2 backdrop-blur">
              <span className="relative inline-flex size-1.5" aria-hidden>
                <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden" />
                <span className="relative inline-block size-1.5 rounded-full bg-accent" />
              </span>
              Oil India Limited · Problem Statement 26165
            </div>
            <h1 style={{ "--d": "120ms" } as React.CSSProperties} className="rise mt-5 font-display text-[2.6rem] font-semibold leading-[1.08] tracking-tight text-ink md:text-[3.6rem]">
              Read every near miss for what it <span className="ink-underline italic text-accent">could have been.</span>
            </h1>
            <p style={{ "--d": "260ms" } as React.CSSProperties} className="rise mt-5 max-w-lg text-[16.5px] leading-relaxed text-ink-2">
              SafetyLens reads unsafe-act, unsafe-condition and near-miss reports from the field, flags <b className="font-semibold text-ink">serious-injury and fatality precursors</b> with the exact evidence, maps IOGP Life-Saving Rules, and keeps a safety professional in control of every call.
            </p>
            <div style={{ "--d": "400ms" } as React.CSSProperties} className="rise mt-7 flex flex-wrap gap-3">
              <Link to="/upload" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[linear-gradient(180deg,var(--accent-2),var(--accent))] px-5 text-[15px] font-semibold text-accent-ink shadow-[0_8px_24px_-10px_var(--accent)] transition-[translate,box-shadow,filter] duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-12px_var(--accent)] hover:brightness-105 active:translate-y-0">
                <Upload className="size-4" /> Analyse reports
              </Link>
              <Link to="/overview" className="group inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface/90 px-5 text-[15px] font-semibold text-ink backdrop-blur transition-colors hover:border-accent/50 hover:bg-surface-2">
                View dashboard <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </div>
            <div style={{ "--d": "520ms" } as React.CSSProperties} className="rise mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <FileSearch className="size-4 text-accent" /> Evidence-linked
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ClipboardCheck className="size-4 text-accent" /> Human-reviewed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <WifiOff className="size-4 text-accent" /> Runs fully offline
              </span>
            </div>
          </div>
        </div>
      </section>

      <LiveStats />

      {/* The problem */}
      <section className="mx-auto max-w-6xl px-4 pt-20">
        <SectionTitle eyebrow="The problem" title="Not every report is equal — but every report gets the same queue">
          Context from Problem Statement 26165, citing DEKRA (Martin &amp; Black, 2015), the EEI SIF precursor model and VelocityEHS (2024).
        </SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { k: "Periodic", t: "Manual triage", d: "UA/UC observations, near-miss and incident reports are reviewed manually at monthly or quarterly intervals — precursors can sit unread for weeks." },
            { k: "51% vs 25.5%", t: "Different causes", d: "Over 15 years non-fatal US accidents fell 51% while fatalities fell only 25.5%: low-severity events do not share the causes of fatal ones." },
            { k: "~20–25%", t: "Of reports carry fatal potential", d: "Leading operators separately flag this minority so HSE interventions go where fatal potential is highest. SafetyLens does that triage continuously." },
          ].map((x, i) => (
            <Reveal key={x.t} delay={i * 110}>
            <div className="lift h-full rounded-2xl border border-line bg-surface p-5">
              <div className="font-display text-3xl font-semibold text-accent">{x.k}</div>
              <h3 className="mt-1 font-display text-lg font-semibold">{x.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{x.d}</p>
            </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
        <SectionTitle eyebrow="How it works" title="From a field narrative to a reviewed precursor">
          Built for the kind of reports field crews actually write — short, informal, sometimes vague — and honest about what they do not say.
        </SectionTitle>
        <ol className="grid gap-4 md:grid-cols-4">
          {STEPS.map(({ Icon, title, text }, i) => (
            <Reveal as="li" key={title} delay={i * 120}>
            <div className="lift group relative h-full rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl border border-line bg-accent-soft text-accent transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                  <Icon className="size-5" />
                </span>
                <span className="font-display text-3xl font-semibold text-line-art-soft">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-display text-xl font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{text}</p>
            </div>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* Assessment contract */}
      <section className="border-y border-line bg-surface-2/60">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <SectionTitle eyebrow="The assessment" title="Three answers — and one of them is “not enough information”">
            SIF potential requires a credible serious mechanism, actual or credible exposure, and a critical barrier that failed. The rubric is a proposal awaiting alignment with OIL's own SIF definition.
          </SectionTitle>
          <div className="grid gap-4 md:grid-cols-3">
            {(["SIF_POTENTIAL", "NON_SIF_POTENTIAL", "INSUFFICIENT_INFORMATION"] as const).map((k, i) => (
              <Reveal key={k} delay={i * 110}>
              <div className="lift h-full rounded-2xl border border-line bg-surface p-5">
                <AssessmentBadge value={k} size="lg" />
                <p className="mt-3 text-sm leading-relaxed text-ink-2">{meta?.rubric.classes[k] ?? "…"}</p>
              </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-10 grid gap-x-10 gap-y-6 md:grid-cols-2">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.title} delay={i * 90} className="flex gap-4">
                <span className="mt-1 h-10 w-px shrink-0 bg-accent" aria-hidden />
                <div>
                  <h3 className="font-display text-lg font-semibold">{p.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{p.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Life-Saving Rules */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <SectionTitle eyebrow="Taxonomy" title="Mapped to the IOGP Life-Saving Rules">
          Multi-label tags with breach / control / unclear status and the supporting quote. Hazards outside the nine rules are kept separate, never forced in.
        </SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rules.map((r, i) => (
            <Reveal key={r.id} delay={(i % 3) * 90 + Math.floor(i / 3) * 60}>
            <div className="lift group h-full rounded-xl border border-line bg-surface p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold tabular text-accent">{r.id}</span>
                <span className="font-display text-[17px] font-semibold">{r.label}</span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{r.scope_note}</p>
            </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-ink-3">
          Rule IDs and text labels only; scope notes are SafetyLens paraphrases.{" "}
          <a href="https://www.iogp.org/workstreams/safety/safety/life-savingrules/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
            IOGP source <ExternalLink className="size-3" />
          </a>
        </p>
      </section>

      {/* Governance */}
      <section className="border-t border-line bg-surface-2/60">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <SectionTitle eyebrow="Built to be trusted" title="Designed for a safety-critical organisation" />
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { Icon: WifiOff, t: "Works without credentials", d: "A transparent rule-based baseline runs entirely on your own server. It is clearly labelled — never presented as a trained model." },
              { Icon: ShieldCheck, t: "No silent data sharing", d: "An optional LLM adapter supports local models or a hosted API. Real reports are blocked from external providers unless policy explicitly allows it." },
              { Icon: Layers, t: "Failures stay visible", d: "If an engine fails, the report is marked as a processing error — never quietly counted as non-SIF. No probability-of-fatality scores." },
              { Icon: UserCheck, t: "Humans decide", d: "Model output and reviewer decisions are stored separately; corrections never overwrite history." },
              { Icon: FlaskConical, t: "Synthetic data stays labelled", d: "Demo and test data is tagged synthetic everywhere and excluded from operational views by default." },
              { Icon: BookOpenCheck, t: "Honest evaluation", d: "A reproducible runner reports precision, recall, abstention and evidence validity — labelled illustrative until validated on reviewed OIL data." },
            ].map(({ Icon, t, d }, i) => (
              <Reveal key={t} delay={(i % 3) * 110}>
              <div className="lift group h-full rounded-2xl border border-line bg-surface p-5">
                <Icon className="size-5 text-accent transition-transform duration-300 group-hover:scale-110" />
                <h3 className="mt-3 font-display text-lg font-semibold">{t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{d}</p>
              </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <Link to="/upload" className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-semibold text-accent-ink hover:opacity-90">
              <Upload className="size-4" /> Try it with the synthetic demo set
            </Link>
            <Link to="/method" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-5 text-[15px] font-semibold hover:bg-surface-2">
              Read the method
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative overflow-hidden border-t border-line bg-surface">
        <EngravedLandscape variant="band" className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full opacity-40" />
        <div className="relative mx-auto grid max-w-6xl gap-6 px-4 pb-24 pt-10 md:grid-cols-[1fr_auto]">
          <div>
            <Wordmark />
            <p className="mt-3 max-w-xl text-xs leading-relaxed text-ink-3">
              Independent hackathon prototype built for Oil India Limited's Problem Statement 26165. Not an official Oil India Limited product or website; the
              name is used to identify the problem owner. IOGP Life-Saving Rules are referenced by text label only.
            </p>
          </div>
          <div className="text-xs leading-relaxed text-ink-3 md:text-right">
            <div>Rubric {meta?.rubric.version ?? "…"} ({meta?.rubric.status ?? "proposed"})</div>
            <div>Taxonomy {meta?.taxonomy.version ?? "…"}</div>
            <div>Not validated on OIL data</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
