import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { HBarChart, TrendChart } from "../components/charts";
import RankingTable, { DensityRange } from "../components/Ranking";
import FilterBar from "../components/FilterBar";
import { PageHeader } from "../components/Layout";
import { AssessmentBadge, Card, EmptyState, ErrorBox, LoadingBlock, Notice, RuleChip, SmallSampleFlag, Stat } from "../components/ui";
import { fmtDateTime, fmtMonth, num } from "../lib/format";
import { useGlobalFilters } from "../lib/filters";

export default function OverviewPage() {
  const { filters, apiQuery, linkQuery } = useGlobalFilters();
  const nav = useNavigate();
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ["overview", apiQuery], queryFn: () => api.overview(apiQuery) });
  const reviewed = filters.view === "reviewed";
  const sep = linkQuery ? "&" : "?";

  return (
    <>
      <PageHeader
        title="Overview"
        description="Report-based view of SIF precursors across the filtered scope. All figures are computed from stored analyses; numerators and denominators are always shown."
      />
      <FilterBar />
      {error ? (
        <ErrorBox error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <LoadingBlock rows={8} />
      ) : data.summary.reporting_volume === 0 ? (
        <Card>
          <EmptyState
            title="No reports in this scope"
            action={
              <Link to="/upload" className="text-sm font-medium text-accent hover:underline">
                Upload & analyse reports →
              </Link>
            }
          >
            {data.meta.synthetic_in_db > 0 && filters.data === "ops"
              ? `${data.meta.synthetic_in_db} synthetic reports are stored but excluded from operational views. Set Data to "Include synthetic" to explore the demo dataset.`
              : "Import a CSV or enter a report manually to populate the dashboard."}
          </EmptyState>
        </Card>
      ) : (
        <div className="stagger space-y-4">
          <Notice icon={<Info className="mt-0.5 size-3.5 shrink-0" />}>
            <b>{data.meta.view_label}.</b> {data.meta.density_definition} {data.meta.filters.notes.join(" ")}
          </Notice>

          <div className="stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Reporting volume" value={num(data.summary.reporting_volume)} sub={`${data.summary.undated} undated · ${data.summary.near_duplicates_in_scope} near-dup`} />
            <Stat
              label="Reported SIF precursor density"
              value={data.summary.density === null ? "—" : `${Math.round(data.summary.density * 100)}%`}
              sub={
                <>
                  {data.summary.sif} / {data.summary.determinate} determinate
                  {data.summary.small_sample && <SmallSampleFlag n={data.summary.determinate} threshold={data.meta.small_sample_threshold} />}
                </>
              }
            />
            <Stat label="SIF-flagged reports" value={num(data.summary.sif)} tone="sif" sub="numerator" />
            <Stat label="Insufficient information" value={num(data.summary.insufficient)} tone="ins" sub="abstentions - not negatives" />
            {reviewed ? (
              <Stat label="Reviewed" value={num(data.summary.reviewed ?? 0)} sub={data.summary.reviewer_agreement ? `${data.summary.reviewer_agreement.agree}/${data.summary.reviewer_agreement.of} agree with model` : undefined} />
            ) : (
              <Stat label="Processing failures" value={num(data.summary.processing_errors ?? 0)} tone={(data.summary.processing_errors ?? 0) > 0 ? "err" : undefined} sub={`${data.summary.pending ?? 0} pending`} />
            )}
            <Stat label="Review backlog" value={num(data.backlog.unreviewed_completed)} sub={`${data.backlog.by_assessment.SIF_POTENTIAL} SIF awaiting review`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Monthly trend" subtitle={`Reports and SIF-flagged reports per month (report date). ${data.summary.undated} undated reports are not plotted.`}>
              {data.trend.length ? (
                <TrendChart data={data.trend.map((t) => ({ label: fmtMonth(t.month), total: t.total, sif: t.sif, determinate: t.determinate, density: t.density, insufficient: t.insufficient }))} />
              ) : (
                <EmptyState title="No dated reports in scope" />
              )}
            </Card>
            <Card title="Review backlog" subtitle="Completed model analyses without any reviewer decision, prioritised by model assessment.">
              <ul className="space-y-2">
                {(["SIF_POTENTIAL", "INSUFFICIENT_INFORMATION", "NON_SIF_POTENTIAL"] as const).map((a) => (
                  <li key={a} className="flex items-center justify-between gap-2">
                    <AssessmentBadge value={a} />
                    <Link className="text-sm font-medium text-accent tabular hover:underline" to={`/reports${linkQuery}${sep}review=unreviewed&assessment=${a}`}>
                      {data.backlog.by_assessment[a]} awaiting review →
                    </Link>
                  </li>
                ))}
                {data.backlog.processing_errors > 0 && (
                  <li className="flex items-center justify-between gap-2">
                    <AssessmentBadge value="PROCESSING_ERROR" />
                    <Link className="text-sm font-medium text-accent tabular hover:underline" to={`/reports${linkQuery}${sep}assessment=PROCESSING_ERROR`}>
                      {data.backlog.processing_errors} need retry →
                    </Link>
                  </li>
                )}
              </ul>
              {data.backlog.oldest_unreviewed && <p className="mt-3 text-xs text-ink-3">Oldest unreviewed analysis imported {fmtDateTime(data.backlog.oldest_unreviewed)}.</p>}
            </Card>
          </div>

          <Card title="Where to focus" subtitle="Site × activity combinations where SIF-flagged reports concentrate, with the failed barriers and Life-Saving Rules behind them. Ordered by number of SIF-flagged reports.">
            {data.focus_areas.length === 0 ? (
              <EmptyState title="No SIF-flagged reports in this scope" />
            ) : (
              <ol className="stagger divide-y divide-line">
                {data.focus_areas.map((f, i) => (
                  <li key={`${f.site}|${f.activity}`} className="grid gap-3 py-3.5 md:grid-cols-[28px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.3fr)] md:items-center">
                    <span className={`grid size-7 place-items-center rounded-full text-xs font-semibold tabular ${i < 3 ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-3 ring-1 ring-line"}`}>{i + 1}</span>
                    <div className="min-w-0">
                      <Link className="font-medium text-ink hover:text-accent" to={`/reports${linkQuery}${sep}site=${encodeURIComponent(f.site)}&activity=${encodeURIComponent(f.activity)}&assessment=SIF_POTENTIAL`}>
                        {f.site} · {f.activity_label}
                      </Link>
                      <div className="text-xs text-ink-3">
                        {f.sif} SIF-flagged of {f.total} reports
                        <SmallSampleFlag n={f.determinate} threshold={data.meta.small_sample_threshold} />
                      </div>
                    </div>
                    <DensityRange sif={f.sif} det={f.determinate} low={f.density_low} high={f.density_high} small={f.small_sample} />
                    <div className="flex flex-wrap gap-1">
                      {f.top_failed_barriers.map((b) => (
                        <span key={b.category} className="inline-flex items-center gap-1 rounded-full border border-sif/20 bg-sif-bg/70 px-2 py-0.5 text-[11px] text-ink-2" title={`${b.reports} SIF report(s) with this failed barrier`}>
                          <span className="size-1.5 rounded-full bg-sif" aria-hidden />
                          {b.label.replace(/\s*\(.*\)$/, "")} <b className="font-semibold tabular text-sif">{b.reports}</b>
                        </span>
                      ))}
                      {f.top_rules.map((r) => (
                        <RuleChip key={r.rule_id} id={r.rule_id} title={`${r.label}: ${r.reports} SIF report(s)`} />
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <div className="grid gap-4 2xl:grid-cols-2">
            <Card title="Sites ranked by reported SIF-precursor density" subtitle="Missing site is grouped as 'Unknown site'.">
              <RankingTable rows={data.by_site} keyLabel="Site" threshold={data.meta.small_sample_threshold} view={filters.view} linkFor={(k) => `/reports${linkQuery}${sep}site=${encodeURIComponent(k)}`} />
            </Card>
            <Card title="Activities ranked by reported SIF-precursor density" subtitle="Activity category extracted by the analysis engine.">
              <RankingTable rows={data.by_activity} keyLabel="Activity" threshold={data.meta.small_sample_threshold} view={filters.view} linkFor={(k) => `/reports${linkQuery}${sep}activity=${encodeURIComponent(k)}`} />
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card
              title="Life-Saving Rule distribution"
              subtitle={`${data.rules.total_tags} tags across ${data.rules.reports_with_any_tag} of ${data.rules.reports_in_scope} ${reviewed ? "reviewed" : "analysed"} reports. ${data.rules.note}`}
            >
              {data.rules.total_tags ? (
                <HBarChart
                  valueLabel="Reports tagged"
                  onSelect={(k) => nav(`/reports${linkQuery}${sep}rule=${k}`)}
                  data={data.rules.rows.map((r) => ({
                    key: r.rule_id,
                    label: `${r.rule_id} ${r.label}`,
                    value: r.reports,
                    tip: [
                      { label: "Breach", value: r.breach },
                      { label: "Control in place", value: r.control },
                      { label: "Unclear", value: r.unclear },
                      { label: "Also SIF-flagged", value: r.sif_reports },
                    ],
                  }))}
                />
              ) : (
                <EmptyState title="No rule tags in scope" />
              )}
            </Card>
            <Card title="Barrier-failure frequencies" subtitle="Model-extracted critical barriers stated as failed/absent (count of reports). Silence is never counted as failure.">
              {data.barriers.length ? (
                <HBarChart
                  valueLabel="Reports with failed barrier"
                  data={data.barriers
                    .filter((b) => b.failed > 0)
                    .map((b) => ({
                      key: b.category,
                      label: b.label.replace(/\s*\(.*\)$/, ""),
                      value: b.failed,
                      tip: [
                        { label: "Failed in SIF-flagged reports", value: b.failed_in_sif },
                        { label: "Stated effective", value: b.effective },
                        { label: "Contradictory / unclear", value: b.unknown },
                      ],
                    }))}
                />
              ) : (
                <EmptyState title="No barrier facts in scope" />
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
