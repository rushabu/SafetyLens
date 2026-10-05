import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, Cpu, History, Info, RefreshCw, ShieldAlert, UserCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import EvidenceText, { FAMILY_LABEL, familyOf, type Family } from "../components/EvidenceText";
import { AssessmentBadge, Button, Card, Chip, ErrorBox, LoadingBlock, Notice, RuleChip, SyntheticChip, cx } from "../components/ui";
import { ASSESSMENTS, ASSESSMENT_LABEL, fmtDate, fmtDateTime, titleCase } from "../lib/format";
import { useGlobalFilters } from "../lib/filters";
import { useMeta } from "../lib/queries";
import type { AnalysisFull, Assessment, Meta, ReportDetail, RuleStatus, Span } from "../types";

const DEFAULT_VISIBLE: Family[] = ["hazard", "exposure", "barrier-failed", "barrier-ok"];

const MODALITY_HELP: Record<string, string> = {
  actual: "Describes something that actually happened or was observed.",
  prevented: "Hazard caught or work stopped before anyone was exposed.",
  hypothetical: "Describes a possible / conditional situation, not an observed event.",
  historical: "Refers to a past event or a discussion (e.g. toolbox talk).",
  unclear: "Could not determine whether the event actually occurred.",
};

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 border-t border-line py-2.5 first:border-t-0">
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

function HoverItem({ k, active, onHover, children, className }: { k: string; active: string | null; onHover: (k: string | null) => void; children: React.ReactNode; className?: string }) {
  return (
    <span
      tabIndex={0}
      onMouseEnter={() => onHover(k)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(k)}
      onBlur={() => onHover(null)}
      className={cx("inline-flex cursor-default items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs", active === k ? "border-accent ring-1 ring-accent" : "border-line-strong", className)}
    >
      {children}
    </span>
  );
}

function EngineInfo({ a }: { a: AnalysisFull }) {
  const v = a.validation as { quotes_total?: number; quotes_repaired?: number; quotes_invalid?: number; dropped?: string[]; retry_errors?: string[] } | null;
  return (
    <div className="space-y-1 text-xs text-ink-2">
      <div className="flex items-center gap-1.5 font-medium text-ink">
        {a.engine_type === "baseline" ? <Cpu className="size-3.5" /> : <Bot className="size-3.5" />}
        {a.engine_type === "baseline" ? "Rule-based baseline (deterministic, not a trained model)" : `LLM: ${a.model}`}
      </div>
      <div>
        Engine {a.engine_version}
        {a.prompt_version && ` · ${a.prompt_version}`}
      </div>
      <div>
        Rubric {a.rubric_version} · {a.taxonomy_version}
      </div>
      <div>
        Analysed {fmtDateTime(a.created_at)}
        {a.latency_ms !== null && ` · ${a.latency_ms} ms`}
        {a.attempts > 1 && ` · ${a.attempts} attempts`}
      </div>
      {v && v.quotes_total !== undefined && (
        <div>
          Evidence quotes: {v.quotes_total} checked against the original text
          {v.quotes_repaired ? `, ${v.quotes_repaired} offsets repaired` : ""}
          {v.quotes_invalid ? `, ${v.quotes_invalid} not found and removed` : ""}
        </div>
      )}
      {v?.dropped && v.dropped.length > 0 && (
        <details>
          <summary className="cursor-pointer">Validator adjustments ({v.dropped.length})</summary>
          <ul className="ml-4 list-disc">
            {v.dropped.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ReviewForm({ detail, meta }: { detail: ReportDetail; meta: Meta }) {
  const qc = useQueryClient();
  const a = detail.analysis;
  const last = detail.reviews[0];
  const modelTags = a?.output?.rule_tags.map((t) => ({ rule_id: t.rule_id, status: t.status })) ?? [];
  const [reviewer, setReviewer] = useState(() => {
    try {
      return localStorage.getItem("safetylens-reviewer") ?? "";
    } catch {
      return "";
    }
  });
  const [assessment, setAssessment] = useState<Assessment | "">((a?.assessment ?? "") as Assessment | "");
  const [tags, setTags] = useState<Record<string, RuleStatus>>(() => Object.fromEntries(modelTags.map((t) => [t.rule_id, t.status])));
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    setAssessment((a?.assessment ?? "") as Assessment | "");
    setTags(Object.fromEntries((a?.output?.rule_tags ?? []).map((t) => [t.rule_id, t.status])));
  }, [a?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sameTags = JSON.stringify(Object.entries(tags).sort()) === JSON.stringify(modelTags.map((t) => [t.rule_id, t.status]).sort());
  const isConfirm = assessment === a?.assessment && sameTags;

  const submit = useMutation({
    mutationFn: () =>
      api.addReview(detail.report.id, {
        reviewer,
        assessment,
        rule_tags: Object.entries(tags).map(([rule_id, status]) => ({ rule_id, status })),
        notes,
        analysis_id: a?.id ?? null,
      }),
    onSuccess: (r) => {
      try {
        localStorage.setItem("safetylens-reviewer", reviewer);
      } catch {
        /* ignore */
      }
      setNotes("");
      setDone(`Saved as ${r.action === "confirm" ? "a confirmation" : "a correction"} at ${fmtDateTime(r.created_at)}.`);
      qc.invalidateQueries({ queryKey: ["report", detail.report.id] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setDone(null);
        submit.mutate();
      }}
    >
      {last && (
        <p className="text-xs text-ink-2">
          Latest review: <AssessmentBadge value={last.assessment} size="sm" /> by {last.reviewer}, {fmtDateTime(last.created_at)}. A new review is added to the history; nothing is overwritten.
        </p>
      )}
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-ink-3">Reviewer assessment</legend>
        <div className="flex flex-col gap-1">
          {ASSESSMENTS.map((s) => (
            <label key={s} className={cx("flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5", assessment === s ? "border-accent bg-accent-soft" : "border-line")}>
              <input type="radio" name="assess" className="accent-[var(--accent)]" checked={assessment === s} onChange={() => setAssessment(s)} />
              <AssessmentBadge value={s} size="sm" />
              {a?.assessment === s && <span className="text-[11px] text-ink-3">model</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-ink-3">Life-Saving Rule tags</legend>
        <div className="max-h-56 space-y-1 overflow-auto pr-1">
          {meta.taxonomy.rules.map((r) => {
            const on = r.id in tags;
            return (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="accent-[var(--accent)]"
                    checked={on}
                    onChange={(e) => {
                      const next = { ...tags };
                      if (e.target.checked) next[r.id] = "unclear";
                      else delete next[r.id];
                      setTags(next);
                    }}
                  />
                  <span className="font-medium tabular">{r.id}</span>
                  <span className="truncate text-ink-2">{r.label}</span>
                </label>
                {on && (
                  <select className="h-7 rounded border border-line-strong bg-surface px-1 text-xs" value={tags[r.id]} onChange={(e) => setTags({ ...tags, [r.id]: e.target.value as RuleStatus })} aria-label={`${r.id} status`}>
                    <option value="breach">breach</option>
                    <option value="control">control</option>
                    <option value="unclear">unclear</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
      <label className="block text-xs font-medium text-ink-3">
        Notes
        <textarea rows={3} className="mt-1 w-full rounded-lg border border-line-strong bg-surface p-2 text-sm text-ink" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why do you agree / disagree? What facts are missing?" />
      </label>
      <label className="block text-xs font-medium text-ink-3">
        Reviewer name *
        <input required className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink" value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Recorded in the audit trail" />
      </label>
      {submit.error && <ErrorBox error={submit.error} />}
      {done && <Notice>{done}</Notice>}
      <Button type="submit" variant="primary" className="w-full" loading={submit.isPending} disabled={!assessment || !reviewer.trim()}>
        <UserCheck className="size-4" />
        {a?.status === "COMPLETED" ? (isConfirm ? "Confirm model output" : "Save correction") : "Save reviewer assessment"}
      </Button>
    </form>
  );
}

export default function ReportDetailPage() {
  const { id } = useParams();
  const rid = Number(id);
  const qc = useQueryClient();
  const { linkQuery } = useGlobalFilters();
  const { data: meta } = useMeta();
  const { data: d, error, isLoading, refetch } = useQuery({
    queryKey: ["report", rid],
    queryFn: () => api.report(rid),
    refetchInterval: (q) => (q.state.data?.pending_job && q.state.data.pending_job.status !== "interrupted" ? 1000 : false),
  });
  const [visible, setVisible] = useState<Set<Family>>(new Set(DEFAULT_VISIBLE));
  const [active, setActive] = useState<string | null>(null);
  const [reEngine, setReEngine] = useState("baseline");
  const reanalyse = useMutation({
    mutationFn: () => api.reanalyse(rid, reEngine),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report", rid] }),
  });

  const ruleLabel = useMemo(() => Object.fromEntries((meta?.taxonomy.rules ?? []).map((r) => [r.id, r.label])), [meta]);
  const a = d?.analysis ?? null;
  const out = a?.output ?? null;

  const labelFor = (s: Span) => {
    switch (s.owner_type) {
      case "hazard":
        return `Mechanism: ${meta?.taxonomy.hazard_categories[s.owner_key]?.label ?? s.owner_key}`;
      case "exposure":
        return `Exposure: ${s.owner_key}`;
      case "barrier": {
        const b = out?.barriers.find((x) => x.category === s.owner_key);
        return `Barrier ${b?.status ?? ""}: ${meta?.taxonomy.barrier_categories[s.owner_key]?.label ?? s.owner_key}`;
      }
      case "rule_tag":
        return `${s.owner_key} ${ruleLabel[s.owner_key] ?? ""}`;
      case "activity":
        return `Activity: ${meta?.taxonomy.activity_categories[s.owner_key] ?? s.owner_key}`;
      case "consequence":
        return "Potential consequence";
      default:
        return `Other hazard: ${s.owner_key}`;
    }
  };

  if (isLoading)
    return (
      <div className="space-y-3">
        <LoadingBlock rows={10} />
      </div>
    );
  if (error || !d || !meta) return <ErrorBox error={error ?? "Report not found"} onRetry={() => refetch()} />;

  const r = d.report;
  const famCounts = new Map<Family, number>();
  (a?.spans ?? []).forEach((s) => famCounts.set(familyOf(s, out), (famCounts.get(familyOf(s, out)) ?? 0) + 1));
  const barriersBy = (st: string) => out?.barriers.filter((b) => b.status === st) ?? [];

  return (
    <>
      <div className="mb-4">
        <Link to={`/reports${linkQuery}`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
          <ArrowLeft className="size-4" /> Reports
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{r.external_id ?? r.uid}</h1>
          {r.external_id && <span className="text-sm text-ink-3">{r.uid}</span>}
          {r.source_type === "synthetic" && <SyntheticChip />}
          {r.source_type === "manual" && <Chip>manual entry</Chip>}
          {r.near_duplicate_of && (
            <Link to={`/reports/${r.near_duplicate_of.id}`}>
              <Chip tone="warn">near-duplicate of {r.near_duplicate_of.uid} ({Math.round(r.near_duplicate_score ?? 0)}/100)</Chip>
            </Link>
          )}
          {r.near_duplicates.map((n) => (
            <Link key={n.id} to={`/reports/${n.id}`}>
              <Chip tone="warn">similar: {n.uid}</Chip>
            </Link>
          ))}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
          <span>Site: {r.site ?? <i className="text-ink-3">unknown</i>}</span>
          <span>
            Date: {r.report_date ? fmtDate(r.report_date) : <i className="text-ink-3">unknown{r.report_date_raw ? ` (unparsed: "${r.report_date_raw}")` : ""}</i>}
          </span>
          <span>Type: {r.report_type ?? <i className="text-ink-3">unknown</i>}</span>
          {r.batch && (
            <Link className="text-accent hover:underline" to={`/upload?batch=${r.batch.id}`}>
              Batch #{r.batch.id}
            </Link>
          )}
        </div>
        {r.provenance && <div className="mt-1 text-xs text-ink-3">Provenance: {r.provenance}</div>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          <Card
            title="Original report"
            subtitle="Unmodified narrative. Highlights are exact character spans verified against this text."
          >
            {out?.flags.includes("instruction_like_text") && (
              <div className="mb-3">
                <Notice tone="warn" icon={<ShieldAlert className="mt-0.5 size-3.5 shrink-0" />}>
                  This report contains instruction-like text (e.g. "ignore previous instructions"). It was treated as report content only and had no effect on the analysis.
                </Notice>
              </div>
            )}
            <EvidenceText text={r.text} spans={a?.spans ?? []} output={out} visible={visible} activeKey={active} onHover={setActive} labelFor={labelFor} />
            {a?.spans.length ? (
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3" role="group" aria-label="Highlight types">
                {(Object.keys(FAMILY_LABEL) as Family[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      const n = new Set(visible);
                      if (n.has(f)) n.delete(f);
                      else n.add(f);
                      setVisible(n);
                    }}
                    aria-pressed={visible.has(f)}
                    className={cx("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs", visible.has(f) ? "border-line-strong text-ink" : "border-line text-ink-3 line-through")}
                  >
                    <span className={cx("inline-block size-3 rounded-sm", `ev-${f}`)} aria-hidden />
                    {FAMILY_LABEL[f]} ({famCounts.get(f) ?? 0})
                  </button>
                ))}
              </div>
            ) : null}
            {Object.keys(r.extra_fields ?? {}).length > 0 && (
              <div className="mt-3 text-xs text-ink-3">
                Extra fields:{" "}
                {Object.entries(r.extra_fields ?? {})
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ")}
              </div>
            )}
          </Card>

          {a?.status === "COMPLETED" && out && (
            <Card title="Extracted precursor facts" subtitle="Hover an item to see its supporting text. Unknown means the report does not say - it is not assumed.">
              <FactRow label="Activity">
                {out.activity ? (
                  <HoverItem k={`activity:${out.activity.category}`} active={active} onHover={setActive}>
                    {meta.taxonomy.activity_categories[out.activity.category] ?? out.activity.category}
                  </HoverItem>
                ) : (
                  <span className="text-ink-3">Unknown</span>
                )}
              </FactRow>
              <FactRow label="Event modality">
                <span className="font-medium">{titleCase(out.event_modality)}</span> <span className="text-xs text-ink-3">— {MODALITY_HELP[out.event_modality]}</span>
              </FactRow>
              <FactRow label="Harm mechanisms">
                <div className="flex flex-wrap gap-1.5">
                  {out.hazards.length ? (
                    out.hazards.map((h) => {
                      const cat = meta.taxonomy.hazard_categories[h.category];
                      return (
                        <HoverItem key={h.category} k={`hazard:${h.category}`} active={active} onHover={setActive} className="ev-hazard">
                          {cat?.label ?? h.category}
                          {cat?.severity === "serious" && <span className="font-semibold text-sif">· serious</span>}
                        </HoverItem>
                      );
                    })
                  ) : (
                    <span className="text-ink-3">None identified</span>
                  )}
                </div>
              </FactRow>
              <FactRow label="Exposure">
                <HoverItem k={`exposure:${out.exposure.status}`} active={active} onHover={setActive} className={out.exposure.status === "unknown" ? "" : "ev-exposure"}>
                  <b>{titleCase(out.exposure.status)}</b>
                  {out.exposure.description && <span className="text-ink-2">— {out.exposure.description}</span>}
                </HoverItem>
              </FactRow>
              <FactRow label="Barriers">
                <div className="space-y-1.5">
                  {(["failed", "effective", "unknown"] as const).map((st) =>
                    barriersBy(st).length ? (
                      <div key={st} className="flex flex-wrap items-center gap-1.5">
                        <span className={cx("w-[70px] text-xs font-semibold", st === "failed" ? "text-sif" : st === "effective" ? "text-non" : "text-ink-3")}>{titleCase(st)}</span>
                        {barriersBy(st).map((b) => (
                          <HoverItem key={b.category} k={`barrier:${b.category}`} active={active} onHover={setActive} className={st === "failed" ? "ev-barrier-failed" : st === "effective" ? "ev-barrier-ok" : ""}>
                            {meta.taxonomy.barrier_categories[b.category]?.label ?? b.category}
                            {!b.critical && <span className="text-ink-3">(non-critical)</span>}
                          </HoverItem>
                        ))}
                      </div>
                    ) : null,
                  )}
                  {!out.barriers.length && <span className="text-ink-3">No barrier stated (not assumed absent)</span>}
                </div>
              </FactRow>
              <FactRow label="Potential consequence">
                {out.potential_consequence?.description ? (
                  <HoverItem k="consequence:consequence" active={active} onHover={setActive}>
                    “{out.potential_consequence.description}”
                  </HoverItem>
                ) : (
                  <span className="text-ink-3">Not stated in the report</span>
                )}
              </FactRow>
              <FactRow label="Other hazards">
                <div className="flex flex-wrap gap-1.5">
                  {out.other_hazards.length ? (
                    out.other_hazards.map((o) => (
                      <HoverItem key={o.id} k={`other_hazard:${o.id}`} active={active} onHover={setActive}>
                        {meta.taxonomy.other_hazards.find((x) => x.id === o.id)?.label ?? o.id}
                      </HoverItem>
                    ))
                  ) : (
                    <span className="text-ink-3">None</span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-ink-3">Kept separate from the Life-Saving Rule list.</p>
              </FactRow>
            </Card>
          )}

          {d.analyses.length > 0 && (
            <Card title="Analysis versions" subtitle="Re-analysis adds a version; earlier outputs and reviews are preserved.">
              <ul className="space-y-1.5 text-sm">
                {d.analyses.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2">
                    <span className="tabular text-ink-3">#{v.id}</span>
                    <AssessmentBadge value={v.status === "PROCESSING_ERROR" ? "PROCESSING_ERROR" : v.assessment} size="sm" />
                    <span className="text-xs text-ink-2">{v.engine_type === "baseline" ? "Baseline" : v.model}</span>
                    <span className="text-xs text-ink-3">{fmtDateTime(v.created_at)}</span>
                    {v.is_current && <Chip tone="accent">current</Chip>}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <select className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-xs" value={reEngine} onChange={(e) => setReEngine(e.target.value)} aria-label="Engine for re-analysis">
                  {meta.engines.map((e) => (
                    <option key={e.id} value={e.id} disabled={!e.available}>
                      {e.label}
                    </option>
                  ))}
                </select>
                <Button size="sm" loading={reanalyse.isPending} disabled={!!d.pending_job && d.pending_job.status !== "interrupted"} onClick={() => reanalyse.mutate()}>
                  <RefreshCw className="size-3.5" /> Re-analyse
                </Button>
                {reanalyse.error && <ErrorBox error={reanalyse.error} />}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card title="SIF assessment" subtitle={a?.engine_type === "llm" ? "LLM output, schema- and evidence-validated" : "Model output (not human-validated)"}>
            {d.pending_job && d.pending_job.status !== "interrupted" ? (
              <div className="flex items-center gap-2 text-sm text-ink-2">
                <RefreshCw className="size-4 animate-spin" /> Analysis {d.pending_job.status} ({d.pending_job.engine})…
              </div>
            ) : !a ? (
              <p className="text-sm text-ink-3">Not analysed yet{d.pending_job?.status === "interrupted" ? " - the job was interrupted by a restart. Resume its batch from Upload & Analyse." : "."}</p>
            ) : a.status === "PROCESSING_ERROR" ? (
              <div className="space-y-2">
                <AssessmentBadge value="PROCESSING_ERROR" size="lg" />
                <p className="text-sm text-ink-2">The engine failed or returned output that did not pass validation. This report has no assessment and is counted as a processing failure - never as non-SIF.</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-2 text-xs text-ink-2">{a.error}</pre>
              </div>
            ) : (
              <div className="space-y-3">
                <AssessmentBadge value={a.assessment} size="lg" />
                <p className="text-sm leading-relaxed text-ink">{a.rationale}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-surface-2 px-2.5 py-2">
                    <div className="text-ink-3">Evidence sufficiency</div>
                    <div className="font-semibold capitalize">{a.evidence_sufficiency}</div>
                  </div>
                  <div className="rounded-lg bg-surface-2 px-2.5 py-2">
                    <div className="text-ink-3">Event modality</div>
                    <div className="font-semibold capitalize">{a.event_modality}</div>
                  </div>
                </div>
                <p className="flex gap-1.5 text-[11px] leading-snug text-ink-3">
                  <Info className="mt-0.5 size-3 shrink-0" />
                  Qualitative sufficiency only - no probability of injury or fatality is estimated. Assessment uses rubric {a.rubric_version} ({meta.rubric.status}).
                </p>
                {out && out.missing_information.length > 0 && (
                  <div className="rounded-lg border border-ins/40 bg-ins-bg p-2.5">
                    <div className="text-xs font-semibold text-ins">Facts needed for a determination</div>
                    <ul className="ml-4 mt-1 list-disc space-y-0.5 text-xs text-ink">
                      {out.missing_information.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {a && (
              <div className="mt-3 border-t border-line pt-3">
                <EngineInfo a={a} />
              </div>
            )}
          </Card>

          {a?.status === "COMPLETED" && out && (
            <Card title="IOGP Life-Saving Rules" subtitle="Relevance and breach status are assessed independently of SIF potential.">
              {out.rule_tags.length === 0 ? (
                <p className="text-sm text-ink-3">No Life-Saving Rule is supported by the text. The report is not forced into the taxonomy.</p>
              ) : (
                <ul className="space-y-2.5">
                  {out.rule_tags.map((t) => (
                    <li
                      key={t.rule_id}
                      onMouseEnter={() => {
                        setActive(`rule_tag:${t.rule_id}`);
                        if (!visible.has("rule")) setVisible(new Set([...visible, "rule"]));
                      }}
                      onMouseLeave={() => setActive(null)}
                      className={cx("rounded-lg border p-2.5", active === `rule_tag:${t.rule_id}` ? "border-accent" : "border-line")}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <RuleChip id={t.rule_id} status={t.status} />
                        <span className="text-sm font-medium">{ruleLabel[t.rule_id]}</span>
                        <span className="text-[11px] text-ink-3">{t.relevance}</span>
                      </div>
                      <p className="mt-1 text-xs text-ink-2">{t.explanation}</p>
                      <p className="mt-1 text-[11px] text-ink-3">Evidence: {t.evidence.map((q) => `“${q.quote}”`).join(" · ")}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card title="Human review" subtitle="Reviewer decisions are stored separately from model output, with timestamp and identity.">
            <ReviewForm detail={d} meta={meta} />
          </Card>

          <Card title={<span className="inline-flex items-center gap-1.5"><History className="size-4" /> Review history ({d.reviews.length})</span>}>
            {d.reviews.length === 0 ? (
              <p className="text-sm text-ink-3">No reviews yet.</p>
            ) : (
              <ol className="space-y-3">
                {d.reviews.map((rv) => (
                  <li key={rv.id} className="border-l-2 border-line-strong pl-3">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-semibold">{rv.reviewer}</span>
                      <span className={rv.action === "confirm" ? "text-non" : "text-ins"}>{rv.action === "confirm" ? "confirmed" : "corrected"}</span>
                      <span className="text-ink-3">{fmtDateTime(rv.created_at)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                      {rv.model_assessment && rv.model_assessment !== rv.assessment && (
                        <>
                          <span className="text-ink-3 line-through">{ASSESSMENT_LABEL[rv.model_assessment]}</span>
                          <span className="text-ink-3">→</span>
                        </>
                      )}
                      <AssessmentBadge value={rv.assessment} size="sm" />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {rv.rule_tags.map((t) => (
                        <RuleChip key={t.rule_id} id={t.rule_id} status={t.status} />
                      ))}
                    </div>
                    {rv.notes && <p className="mt-1 text-xs text-ink-2">“{rv.notes}”</p>}
                    <p className="mt-0.5 text-[10px] text-ink-3">Reviewed analysis #{rv.analysis_id ?? "—"}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}


