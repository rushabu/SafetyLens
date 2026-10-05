import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Search, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import FilterBar from "../components/FilterBar";
import { PageHeader } from "../components/Layout";
import { AssessmentBadge, Card, Chip, EmptyState, ErrorBox, LoadingBlock, RuleChip, SyntheticChip, cx } from "../components/ui";
import { ASSESSMENT_LABEL, fmtDate, titleCase } from "../lib/format";
import { toApiQuery, useGlobalFilters } from "../lib/filters";
import { useMeta } from "../lib/queries";
import type { ModelStatus } from "../types";

const STATUSES: ModelStatus[] = ["SIF_POTENTIAL", "INSUFFICIENT_INFORMATION", "NON_SIF_POTENTIAL", "PROCESSING_ERROR", "PENDING"];

export default function ReportsPage() {
  const { filters, params, update, linkQuery, setParams } = useGlobalFilters();
  const { data: meta } = useMeta();
  const [q, setQ] = useState(params.get("q") ?? "");
  const assessment = params.getAll("assessment");
  const rule = params.get("rule") ?? "";
  const review = params.get("review") ?? "";
  const sort = params.get("sort") ?? "date_desc";
  const page = Number(params.get("page") ?? 1);
  const batchId = params.get("batch_id");

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) update({}, { q: q || null });
    }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const extra = new URLSearchParams();
  if (params.get("q")) extra.set("q", params.get("q")!);
  assessment.forEach((a) => extra.append("assessment", a));
  if (rule) extra.set("rule", rule);
  if (review) extra.set("review_status", review);
  if (batchId) extra.set("batch_id", batchId);
  const base = toApiQuery(filters, extra);
  const listQs = `${base}&sort=${sort}&page=${page}&page_size=25`;

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["reports", listQs],
    queryFn: () => api.reports(listQs),
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const toggleAssessment = (a: string) => {
    const next = assessment.includes(a) ? assessment.filter((x) => x !== a) : [...assessment, a];
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("assessment");
        p.delete("page");
        next.forEach((x) => p.append("assessment", x));
        return p;
      },
      { replace: true },
    );
  };
  const sel = "h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm";
  const statuses = filters.view === "reviewed" ? STATUSES.slice(0, 3) : STATUSES;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Search and filter every imported report. Model output and reviewer decisions are shown separately; filters here match the Overview and Patterns pages."
        actions={
          <a href={`/api/export/reports.csv?${base}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium hover:bg-surface-2">
            <Download className="size-4" aria-hidden /> Export CSV ({data?.total ?? "…"})
          </a>
        }
      />
      <FilterBar />
      <Card bodyClass="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-ink-3" aria-hidden />
            <input
              className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-8 pr-2 text-sm"
              placeholder="Search text, report ID or site"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search reports"
            />
          </div>
          <select className={sel} value={rule} onChange={(e) => update({}, { rule: e.target.value || null })} aria-label="Life-Saving Rule">
            <option value="">All rules</option>
            {meta?.taxonomy.rules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} {r.label}
              </option>
            ))}
          </select>
          <select className={sel} value={review} onChange={(e) => update({}, { review: e.target.value || null })} aria-label="Review status">
            <option value="">Reviewed & unreviewed</option>
            <option value="unreviewed">Awaiting review</option>
            <option value="reviewed">Reviewed</option>
          </select>
          <select className={sel} value={sort} onChange={(e) => update({}, { sort: e.target.value })} aria-label="Sort">
            <option value="triage">Triage priority (SIF first)</option>
            <option value="date_desc">Newest report date</option>
            <option value="date_asc">Oldest report date</option>
            <option value="created_desc">Recently imported</option>
            <option value="site">Site A–Z</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
          <span className="mr-1 text-xs text-ink-3">{filters.view === "reviewed" ? "Reviewer assessment:" : "Model status:"}</span>
          {statuses.map((s) => (
            <button key={s} onClick={() => toggleAssessment(s)} aria-pressed={assessment.includes(s)} className={cx("rounded-md p-0.5", assessment.includes(s) ? "ring-2 ring-accent" : "opacity-80 hover:opacity-100")}>
              <AssessmentBadge value={s} size="sm" />
            </button>
          ))}
          {batchId && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs">
              <Chip tone="accent">Batch #{batchId}</Chip>
              <button className="text-accent hover:underline" onClick={() => update({}, { batch_id: null })}>
                clear
              </button>
            </span>
          )}
          {isFetching && !isLoading && <span className="ml-auto text-xs text-ink-3">Updating…</span>}
        </div>

        {error ? (
          <div className="p-4">
            <ErrorBox error={error} onRetry={() => refetch()} />
          </div>
        ) : isLoading ? (
          <div className="p-4">
            <LoadingBlock rows={8} />
          </div>
        ) : !data?.items.length ? (
          <EmptyState
            title="No reports match"
            action={
              <Link to="/upload" className="text-sm font-medium text-accent hover:underline">
                Upload reports →
              </Link>
            }
          >
            {filters.data === "ops" ? "Synthetic data is hidden by default - switch Data to 'Include synthetic' to see demo reports." : "Try clearing filters or search."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-surface-2 text-xs text-ink-3">
                <tr>
                  <th className="px-3 py-2 font-medium">Report</th>
                  <th className="px-3 py-2 font-medium">Date · Site</th>
                  <th className="px-3 py-2 font-medium">{filters.view === "reviewed" ? "Reviewer assessment" : "Model assessment"}</th>
                  <th className="px-3 py-2 font-medium">Life-Saving Rules</th>
                  <th className="px-3 py-2 font-medium">Narrative</th>
                  <th className="px-3 py-2 font-medium">Review</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => {
                  const tags = filters.view === "reviewed" ? r.review_rule_tags : r.rule_tags;
                  return (
                    <tr key={r.id} className="border-t border-line align-top hover:bg-surface-2/60">
                      <td className="px-3 py-2.5">
                        <Link to={`/reports/${r.id}${linkQuery}`} className="whitespace-nowrap font-medium text-accent hover:underline">
                          {r.external_id ?? r.uid}
                        </Link>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.source_type === "synthetic" && <SyntheticChip compact />}
                          {r.source_type === "manual" && <Chip>manual</Chip>}
                          {r.near_duplicate && <Chip tone="warn">near-dup</Chip>}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-2">
                        <div>{fmtDate(r.report_date)}</div>
                        <div className="text-ink-3">{r.site ?? "Unknown site"}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        {filters.view === "reviewed" ? (
                          r.review_assessment ? <AssessmentBadge value={r.review_assessment} size="sm" /> : <span className="text-xs text-ink-3">Not reviewed</span>
                        ) : (
                          <AssessmentBadge value={r.status} size="sm" />
                        )}
                        <div className="mt-1 text-[11px] text-ink-3">
                          {titleCase(r.activity)}
                          {r.sufficiency && ` · evidence ${r.sufficiency}`}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {tags.length ? tags.map((t) => <RuleChip key={t.rule_id} id={t.rule_id} status={t.status} />) : <span className="text-xs text-ink-3">—</span>}
                        </div>
                      </td>
                      <td className="max-w-[420px] px-3 py-2.5 text-xs leading-relaxed text-ink-2">{r.excerpt}{r.excerpt.length >= 220 && "…"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                        {r.reviewed ? (
                          <span className="inline-flex items-center gap-1 text-non" title={`Reviewer: ${r.reviewer}`}>
                            <UserCheck className="size-3.5" aria-hidden />
                            {r.review_assessment && r.review_assessment !== r.model_assessment ? "Corrected" : "Confirmed"}
                          </span>
                        ) : r.status === "PENDING" || r.status === "PROCESSING_ERROR" ? (
                          <span className="text-ink-3">—</span>
                        ) : (
                          <span className="text-ins">Awaiting</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-ink-2">
            <span>
              {data.total} report{data.total === 1 ? "" : "s"}
              {assessment.length > 0 && ` · status: ${assessment.map((a) => ASSESSMENT_LABEL[a as ModelStatus]).join(", ")}`}
            </span>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => update({}, { page: String(page - 1) })} className="rounded p-1 hover:bg-surface-2 disabled:opacity-40" aria-label="Previous page">
                <ChevronLeft className="size-4" />
              </button>
              <span className="tabular">
                Page {page} of {pages}
              </span>
              <button disabled={page >= pages} onClick={() => update({}, { page: String(page + 1) })} className="rounded p-1 hover:bg-surface-2 disabled:opacity-40" aria-label="Next page">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
