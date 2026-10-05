import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Info, MapPin } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import FilterBar from "../components/FilterBar";
import { PageHeader } from "../components/Layout";
import { AssessmentBadge, Card, Chip, EmptyState, ErrorBox, LoadingBlock, Notice, SyntheticChip, cx } from "../components/ui";
import { fmtDate } from "../lib/format";
import { useGlobalFilters } from "../lib/filters";

export default function PatternsPage() {
  const { apiQuery, linkQuery, filters } = useGlobalFilters();
  const [minSupport, setMinSupport] = useState(2);
  const [groupBy, setGroupBy] = useState("activity_hazard_barrier");
  const [open, setOpen] = useState<string | null>(null);
  const [showNoBarrier, setShowNoBarrier] = useState(false);
  const qs = `${apiQuery}&min_support=${minSupport}&group_by=${groupBy}`;
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ["patterns", qs], queryFn: () => api.patterns(qs) });
  const pats = (data?.patterns ?? []).filter((p) => showNoBarrier || p.barrier !== "no_failed_barrier_stated");

  return (
    <>
      <PageHeader
        title="Recurring patterns"
        description="Recurring precursor patterns - activity, location and barrier failure - found by deterministic grouping of the normalised categories each analysis extracted. Every pattern lists the reports that support it."
      />
      <FilterBar />
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5 text-ink-2">
          Group by
          <select className="h-8 rounded-lg border border-line-strong bg-surface px-2" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="activity_hazard_barrier">Activity → mechanism → failed barrier</option>
            <option value="site_activity_barrier">Location → activity → failed barrier</option>
            <option value="site_hazard_barrier">Location → mechanism → failed barrier</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-ink-2">
          Minimum reports per pattern
          <select className="h-8 rounded-lg border border-line-strong bg-surface px-2" value={minSupport} onChange={(e) => setMinSupport(Number(e.target.value))}>
            {[2, 3, 5, 10].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-ink-2">
          <input type="checkbox" className="accent-[var(--accent)]" checked={showNoBarrier} onChange={(e) => setShowNoBarrier(e.target.checked)} />
          Include patterns with no failed barrier stated
        </label>
      </div>
      {error ? (
        <ErrorBox error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <LoadingBlock rows={8} />
      ) : (
        <>
          <div className="mb-3">
            <Notice icon={<Info className="mt-0.5 size-3.5 shrink-0" />}>
              {data.meta.method} {data.reports_considered} analysed reports considered. Pattern membership uses model-extracted facts; the assessment column follows the{" "}
              {filters.view === "reviewed" ? "reviewer" : "model"} view. Counts are report-based and not exposure-adjusted.
            </Notice>
          </div>
          {pats.length === 0 ? (
            <Card>
              <EmptyState title="No recurring patterns in this scope">Patterns need at least {minSupport} reports sharing the same activity, mechanism and failed barrier. Widen the filters or include synthetic data.</EmptyState>
            </Card>
          ) : (
            <Card bodyClass="p-0">
              <ul>
                {pats.map((p) => {
                  const isOpen = open === p.id;
                  return (
                    <li key={p.id} className="border-b border-line last:border-0">
                      <button className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen}>
                        {isOpen ? <ChevronDown className="size-4 text-ink-3" /> : <ChevronRight className="size-4 text-ink-3" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-sm">
                            {p.site && (
                              <>
                                <Chip tone="accent">
                                  <MapPin className="size-3" aria-hidden /> {p.site}
                                </Chip>
                                <span className="text-ink-3">→</span>
                              </>
                            )}
                            {p.activity_label && (
                              <>
                                <Chip>{p.activity_label}</Chip>
                                <span className="text-ink-3">→</span>
                              </>
                            )}
                            {p.hazard_label && (
                              <>
                                <span className={cx("rounded border px-1.5 py-0.5 text-[11px] font-medium ev-hazard", p.hazard_serious ? "border-sif/40" : "border-line")}>
                                  {p.hazard_label}
                                  {p.hazard_serious && <span className="ml-1 text-sif">· serious</span>}
                                </span>
                                <span className="text-ink-3">→</span>
                              </>
                            )}
                            <span className={cx("rounded border border-line px-1.5 py-0.5 text-[11px] font-medium", p.barrier !== "no_failed_barrier_stated" && "ev-barrier-failed")}>{p.barrier_label}</span>
                          </div>
                          <div className="mt-1 text-xs text-ink-3">
                            {p.sites.length} site{p.sites.length === 1 ? "" : "s"} · {p.first_date ? `${fmtDate(p.first_date)} – ${fmtDate(p.last_date)}` : "undated"}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-right text-sm">
                          <div>
                            <div className="text-lg font-semibold tabular">{p.report_count}</div>
                            <div className="text-[11px] text-ink-3">reports</div>
                          </div>
                          <div>
                            <div className="text-lg font-semibold tabular text-sif">{p.sif_count}</div>
                            <div className="text-[11px] text-ink-3">SIF-flagged</div>
                          </div>
                          {p.small_sample && <Chip tone="warn">small n</Chip>}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="overflow-x-auto bg-surface-2/50 px-4 pb-3">
                          <table className="w-full text-left text-xs">
                            <thead className="text-ink-3">
                              <tr>
                                <th className="py-1.5 pr-3 font-medium">Supporting report</th>
                                <th className="py-1.5 pr-3 font-medium">Site</th>
                                <th className="py-1.5 pr-3 font-medium">Date</th>
                                <th className="py-1.5 font-medium">Assessment</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.reports.map((r) => (
                                <tr key={r.id} className="border-t border-line">
                                  <td className="py-1.5 pr-3">
                                    <Link className="font-medium text-accent hover:underline" to={`/reports/${r.id}${linkQuery}`}>
                                      {r.external_id ?? r.uid}
                                    </Link>{" "}
                                    {r.source_type === "synthetic" && <SyntheticChip compact />}
                                  </td>
                                  <td className="py-1.5 pr-3">{r.site ?? "Unknown"}</td>
                                  <td className="py-1.5 pr-3">{fmtDate(r.report_date)}</td>
                                  <td className="py-1.5">{r.assessment ? <AssessmentBadge value={r.assessment} size="sm" /> : <span className="text-ink-3">not reviewed</span>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {p.reports_truncated && <p className="mt-1 text-ink-3">Showing the first {p.reports.length} reports.</p>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}
