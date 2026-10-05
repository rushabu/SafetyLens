import type {
  Batch,
  BatchDetail,
  EvalRun,
  EvalRunSummary,
  FilterOptions,
  Meta,
  Overview,
  Pattern,
  Preview,
  ReportDetail,
  ReportListItem,
  ReviewRec,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, "Cannot reach the SafetyLens API. Is the backend running on port 8000?");
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail)) msg = body.detail.map((d: { msg: string; loc?: string[] }) => `${d.loc?.slice(1).join(".") ?? ""} ${d.msg}`.trim()).join("; ");
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  meta: () => request<Meta>("/api/meta"),
  filterOptions: () => request<FilterOptions>("/api/filters/options"),
  overview: (qs: string) => request<Overview>(`/api/analytics/overview?${qs}`),
  patterns: (qs: string) => request<{ meta: { method: string; min_support: number; group_by: string; dimensions: string[]; filters: { notes: string[] } }; patterns: Pattern[]; reports_considered: number }>(`/api/patterns?${qs}`),
  reports: (qs: string) => request<{ items: ReportListItem[]; total: number; page: number; page_size: number }>(`/api/reports?${qs}`),
  report: (id: number) => request<ReportDetail>(`/api/reports/${id}`),
  reanalyse: (id: number, engine: string) => request<{ job_id: number; already_pending: boolean }>(`/api/reports/${id}/reanalyse`, json({ engine })),
  addReview: (id: number, body: { reviewer: string; assessment: string; rule_tags: { rule_id: string; status: string }[]; notes: string; analysis_id: number | null }) =>
    request<ReviewRec>(`/api/reports/${id}/reviews`, json(body)),
  createReport: (body: Record<string, unknown>) => request<{ report_id: number; report_uid: string; batch_id: number }>("/api/reports", json(body)),
  preview: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<Preview>("/api/imports/preview", { method: "POST", body: fd });
  },
  commit: (file: File, opts: { source_type: string; engine: string; provenance?: string; batch_name?: string; force?: boolean }) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("source_type", opts.source_type);
    fd.append("engine", opts.engine);
    if (opts.provenance) fd.append("provenance", opts.provenance);
    if (opts.batch_name) fd.append("batch_name", opts.batch_name);
    fd.append("force", String(!!opts.force));
    return request<{ created: boolean; batch: Batch }>("/api/imports/commit", { method: "POST", body: fd });
  },
  samples: () => request<{ name: string; description: string; available: boolean }[]>("/api/imports/samples"),
  batches: () => request<Batch[]>("/api/batches"),
  batch: (id: number) => request<BatchDetail>(`/api/batches/${id}`),
  resume: (id: number) => request<{ requeued: number }>(`/api/batches/${id}/resume`, { method: "POST" }),
  retryFailed: (id: number) => request<{ requeued: number }>(`/api/batches/${id}/retry-failed`, { method: "POST" }),
  evalRuns: () => request<EvalRunSummary[]>("/api/eval/runs"),
  evalRun: (id: number) => request<EvalRun>(`/api/eval/runs/${id}`),
};
