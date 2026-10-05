import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { PageHeader } from "../components/Layout";
import { Card, EmptyState, ErrorBox, LoadingBlock, Notice, Stat, cx } from "../components/ui";
import { ASSESSMENT_LABEL, fmtDateTime, metric, pct } from "../lib/format";
import { useRuleLabels } from "../lib/queries";
import type { ModelStatus } from "../types";

const CLASSES = ["SIF_POTENTIAL", "NON_SIF_POTENTIAL", "INSUFFICIENT_INFORMATION"] as const;
const COLS = [...CLASSES, "PROCESSING_ERROR"] as const;

export default function EvaluationPage() {
  const runs = useQuery({ queryKey: ["eval-runs"], queryFn: api.evalRuns });
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    if (sel === null && runs.data?.length) setSel(runs.data[0].id);
  }, [runs.data, sel]);
  const run = useQuery({ queryKey: ["eval-run", sel], queryFn: () => api.evalRun(sel!), enabled: sel !== null });
  const ruleLabels = useRuleLabels();
  const m = run.data?.metrics;

  return (
    <>
      <PageHeader
        title="Evaluation"
        description="Reproducible evaluation of the analysis engines against separately stored reference labels. Run it from the command line; results appear here."
      />
      <div className="mb-4">
        <Notice tone="warn" icon={<FlaskConical className="mt-0.5 size-3.5 shrink-0" />}>
          <b>Synthetic / illustrative results.</b> The bundled dataset and its reference labels were written by the prototype authors and are not expert-validated. These numbers say nothing about performance on OIL reports. Labels are never shown to the engines; scenario paraphrases are kept within a single split.
        </Notice>
      </div>
      {runs.error ? (
        <ErrorBox error={runs.error} />
      ) : runs.isLoading ? (
        <LoadingBlock rows={4} />
      ) : !runs.data?.length ? (
        <Card>
          <EmptyState title="No evaluation runs yet">
            From the <code>backend</code> folder run <code className="rounded bg-surface-2 px-1">python -m eval.run_eval --engine baseline --split test</code>. With an LLM configured, add a run with <code className="rounded bg-surface-2 px-1">--engine llm</code> to compare.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card title="Runs" bodyClass="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-surface-2 text-xs text-ink-3">
                  <tr>
                    <th className="px-3 py-2">Run</th>
                    <th className="px-3 py-2">Engine</th>
                    <th className="px-3 py-2">Split</th>
                    <th className="px-3 py-2 text-right">Cases</th>
                    <th className="px-3 py-2 text-right">SIF precision</th>
                    <th className="px-3 py-2 text-right">SIF recall (end-to-end)</th>
                    <th className="px-3 py-2 text-right">Coverage</th>
                    <th className="px-3 py-2">When</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.data.map((r) => (
                    <tr key={r.id} onClick={() => setSel(r.id)} className={cx("cursor-pointer border-t border-line hover:bg-surface-2", sel === r.id && "bg-accent-soft")}>
                      <td className="px-3 py-2 tabular">#{r.id}</td>
                      <td className="px-3 py-2">
                        {r.engine === "baseline" ? "Rule-based baseline" : r.model}
                        <div className="text-[11px] text-ink-3">{r.engine_version}</div>
                      </td>
                      <td className="px-3 py-2">{r.split}</td>
                      <td className="px-3 py-2 text-right tabular">{r.n_cases}</td>
                      <td className="px-3 py-2 text-right tabular">{metric(r.headline.precision)}</td>
                      <td className="px-3 py-2 text-right tabular">{metric(r.headline.recall)}</td>
                      <td className="px-3 py-2 text-right tabular">{pct(r.headline.coverage)}</td>
                      <td className="px-3 py-2 text-xs text-ink-3">{fmtDateTime(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {run.isLoading && <LoadingBlock rows={6} />}
          {m && run.data && (
            <>
              <p className="text-xs text-ink-3">{run.data.label_provenance}</p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Stat label="SIF precision" value={metric(m.sif.precision)} sub={`${m.sif.tp} of ${m.sif.predicted_sif} flagged`} />
                <Stat label="SIF recall (end-to-end)" value={metric(m.sif.recall)} sub={`answered-only: ${metric(m.sif.recall_on_answered)}`} />
                <Stat label="SIF F1" value={metric(m.sif.f1)} />
                <Stat label="Coverage" value={pct(m.abstention.coverage)} sub={`abstention ${pct(m.abstention.abstention_rate)}`} />
                <Stat label="Evidence span validity" value={pct(m.evidence.validity_rate, 1)} sub={`${m.evidence.quotes_valid}/${m.evidence.quotes_checked} spans`} />
                <Stat label="Processing failures" value={m.processing_failures} sub={`p50 ${m.latency_ms.p50} ms · p95 ${m.latency_ms.p95} ms`} tone={m.processing_failures ? "err" : undefined} />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <Card title="Confusion matrix" subtitle="Rows: reference label. Columns: engine output. Processing errors are failures, not a class.">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-ink-3">
                          <th className="p-2 text-left font-medium">Reference ↓ / Output →</th>
                          {COLS.map((c) => (
                            <th key={c} className="p-2 text-right font-medium">
                              {ASSESSMENT_LABEL[c as ModelStatus]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {CLASSES.map((r) => (
                          <tr key={r} className="border-t border-line">
                            <td className="p-2 text-xs font-medium">{ASSESSMENT_LABEL[r]}</td>
                            {COLS.map((c) => (
                              <td key={c} className={cx("p-2 text-right tabular", r === c ? "font-semibold" : "text-ink-2")}>
                                {m.confusion_matrix[r]?.[c] ?? 0}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 rounded-lg bg-surface-2 p-3 text-xs">
                    <div className="mb-1 font-semibold">Capture of the {m.sif_capture.reference_sif} reference-SIF cases</div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        ["Captured", m.sif_capture.captured, "text-non"],
                        ["Abstained", m.sif_capture.abstained, "text-ins"],
                        ["Missed (non-SIF)", m.sif_capture.missed_as_non_sif, "text-sif"],
                        ["Errored", m.sif_capture.errored, "text-err"],
                      ].map(([l, v, c]) => (
                        <div key={l as string}>
                          <div className={cx("text-lg font-semibold tabular", c as string)}>{v}</div>
                          <div className="text-ink-3">{l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
                <Card title="Life-Saving Rule tagging" subtitle={`Micro P/R/F1 ${metric(m.rules.micro.precision)} / ${metric(m.rules.micro.recall)} / ${metric(m.rules.micro.f1)} · macro F1 ${metric(m.rules.macro_f1)} · exact tag-set match ${pct(m.rules.exact_set_match_rate)}`}>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-ink-3">
                      <tr>
                        <th className="py-1.5 text-left font-medium">Rule</th>
                        <th className="py-1.5 text-right font-medium">Support</th>
                        <th className="py-1.5 text-right font-medium">Precision</th>
                        <th className="py-1.5 text-right font-medium">Recall</th>
                        <th className="py-1.5 text-right font-medium">F1</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(m.rules.per_rule).map(([rid, v]) => (
                        <tr key={rid} className="border-t border-line">
                          <td className="py-1.5 text-xs">
                            <span className="font-medium">{rid}</span> <span className="text-ink-2">{ruleLabels[rid]}</span>
                            {v.support < 5 && <span className="ml-1 text-[10px] text-ins">small n</span>}
                          </td>
                          <td className="py-1.5 text-right tabular">{v.support}</td>
                          <td className="py-1.5 text-right tabular">{metric(v.precision)}</td>
                          <td className="py-1.5 text-right tabular">{metric(v.recall)}</td>
                          <td className="py-1.5 text-right tabular">{metric(v.f1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[11px] text-ink-3">{m.rules.note}</p>
                </Card>
              </div>
              {m.disagreements && m.disagreements.length > 0 && (
                <Card title={`Disagreements (${m.disagreements.length})`} subtitle="Cases where the assessment or the rule-tag set differs from the reference label - useful for error analysis.">
                  <div className="max-h-80 overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-surface text-ink-3">
                        <tr>
                          <th className="py-1.5 pr-2">Case</th>
                          <th className="py-1.5 pr-2">Scenario group</th>
                          <th className="py-1.5 pr-2">Reference</th>
                          <th className="py-1.5 pr-2">Output</th>
                          <th className="py-1.5">Rules ref → out</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.disagreements.map((x) => (
                          <tr key={x.report_id} className="border-t border-line">
                            <td className="py-1.5 pr-2 tabular">{x.report_id}</td>
                            <td className="py-1.5 pr-2 text-ink-2">{x.scenario_group}</td>
                            <td className="py-1.5 pr-2">{ASSESSMENT_LABEL[x.ref as ModelStatus]}</td>
                            <td className={cx("py-1.5 pr-2", x.ref !== x.pred && "font-semibold")}>{ASSESSMENT_LABEL[x.pred as ModelStatus]}</td>
                            <td className="py-1.5 text-ink-2">
                              {x.ref_rules.join(", ") || "—"} → {x.pred_rules.join(", ") || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
