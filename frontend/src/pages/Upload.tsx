import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileUp, PlayCircle, RotateCcw, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { PageHeader } from "../components/Layout";
import { Button, Card, Chip, EmptyState, ErrorBox, LoadingBlock, Notice, SyntheticChip, cx } from "../components/ui";
import { fmtDateTime, titleCase } from "../lib/format";
import { useMeta } from "../lib/queries";
import type { Batch, Preview } from "../types";

const ACTIVE = ["queued", "processing"];

function EngineSelect({ value, onChange, sourceType }: { value: string; onChange: (v: string) => void; sourceType: string }) {
  const { data: meta } = useMeta();
  const llm = meta?.engines.find((e) => e.id === "llm");
  const blocked = !!(llm?.available && llm.external && llm.data_policy === "synthetic_only" && sourceType !== "synthetic");
  // The data policy forbids sending these reports to the external LLM: make that choice explicit
  // in the form (option disabled with the reason) rather than failing on submit.
  useEffect(() => {
    if (blocked && value === "llm") onChange("baseline");
  }, [blocked, value, onChange]);
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink">Analysis engine</legend>
      <div className="space-y-1.5">
        {meta?.engines.map((e) => (
          <label key={e.id} className={cx("flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm", value === e.id ? "border-accent bg-accent-soft" : "border-line", !e.available && "cursor-not-allowed opacity-60")}>
            <input type="radio" name="engine" className="mt-0.5 accent-[var(--accent)]" checked={value === e.id} disabled={!e.available || (e.id === "llm" && blocked)} onChange={() => onChange(e.id)} />
            <span>
              <span className="font-medium text-ink">{e.label}</span>
              <span className="block text-xs text-ink-3">{e.description}</span>
              {e.id === "llm" && blocked && <span className="block text-xs font-medium text-ins">Unavailable for non-synthetic reports: external provider and LLM_DATA_POLICY=synthetic_only.</span>}
            </span>
          </label>
        ))}
      </div>
      {value === "llm" && llm?.external && (
        <Notice tone="warn" icon={<ShieldAlert className="mt-0.5 size-3.5 shrink-0" />}>
          Report text will be sent to an external provider ({llm.provider}). Data policy: {llm.data_policy}. Hosted free tiers are rate-limited, so large batches can take a long time. If the LLM fails, rows are marked as processing errors - the baseline is never substituted silently.
        </Notice>
      )}
    </fieldset>
  );
}

function PreviewPanel({ file, preview, onDone }: { file: File; preview: Preview; onDone: (b: Batch) => void }) {
  const { data: meta } = useMeta();
  const [sourceType, setSourceType] = useState(preview.suggested_source_type);
  const [engine, setEngine] = useState<string>(meta?.default_engine ?? "baseline");
  const [provenance, setProvenance] = useState("");
  const [name, setName] = useState("");
  const commit = useMutation({
    mutationFn: (force: boolean) => api.commit(file, { source_type: sourceType, engine, provenance, batch_name: name || undefined, force }),
    onSuccess: (r) => onDone(r.batch),
  });
  const errors = preview.issues.filter((i) => i.severity === "error");
  const skipped = preview.issues.filter((i) => i.severity === "skipped");
  const warnings = preview.issues.filter((i) => i.severity === "warning");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Rows in file", preview.total_rows, ""],
          ["Will be imported", preview.importable_rows, "text-non"],
          ["Rejected (errors)", preview.error_rows, preview.error_rows ? "text-sif" : ""],
          ["Exact duplicates (skipped)", preview.duplicate_rows, preview.duplicate_rows ? "text-ins" : ""],
          ["Near-duplicates (flagged)", preview.near_duplicate_rows, preview.near_duplicate_rows ? "text-ins" : ""],
        ].map(([l, v, c]) => (
          <div key={l as string} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
            <div className="text-[11px] text-ink-3">{l}</div>
            <div className={cx("text-lg font-semibold tabular", c as string)}>{v}</div>
          </div>
        ))}
      </div>

      <div className="text-xs text-ink-2">
        <span className="font-medium text-ink">Column mapping: </span>
        {Object.entries(preview.mapping).map(([k, v]) => (
          <Chip key={k}>
            {k === v ? k : `${k} → ${v}`}
          </Chip>
        ))}
        {preview.ignored_columns.length > 0 && <span className="ml-2">Ignored (kept as extra fields): {preview.ignored_columns.join(", ")}</span>}
        {preview.missing_optional_columns.length > 0 && <span className="ml-2 text-ink-3">Missing optional: {preview.missing_optional_columns.join(", ")} → stored as unknown</span>}
      </div>

      {preview.already_imported_batch && (
        <Notice tone="warn" icon={<AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}>
          This exact file was already imported as batch <b>#{preview.already_imported_batch.id}</b> ({fmtDateTime(preview.already_imported_batch.created_at)}). Importing again returns the existing batch - nothing is duplicated or re-analysed.
        </Notice>
      )}

      {(errors.length > 0 || skipped.length > 0 || warnings.length > 0) && (
        <div className="max-h-56 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface-2 text-ink-3">
              <tr>
                <th className="px-2 py-1.5">Row</th>
                <th className="px-2 py-1.5">Result</th>
                <th className="px-2 py-1.5">Detail</th>
              </tr>
            </thead>
            <tbody>
              {[...errors, ...skipped, ...warnings].map((i, idx) => (
                <tr key={idx} className="border-t border-line">
                  <td className="px-2 py-1 tabular">{i.row_number}</td>
                  <td className="px-2 py-1">
                    <span className={cx("font-semibold", i.severity === "error" ? "text-sif" : "text-ins")}>{i.severity === "error" ? "Rejected" : i.severity === "skipped" ? "Skipped" : "Warning"}</span>
                  </td>
                  <td className="px-2 py-1 text-ink-2">{i.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview.sample_rows.length > 0 && (
        <details className="rounded-lg border border-line" open>
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Preview of rows to import (first {preview.sample_rows.length})</summary>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface-2 text-ink-3">
                <tr>
                  <th className="px-2 py-1.5">Row</th>
                  <th className="px-2 py-1.5">ID</th>
                  <th className="px-2 py-1.5">Site</th>
                  <th className="px-2 py-1.5">Date</th>
                  <th className="px-2 py-1.5">Text</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample_rows.map((r) => (
                  <tr key={r.row_number} className="border-t border-line align-top">
                    <td className="px-2 py-1 tabular">{r.row_number}</td>
                    <td className="px-2 py-1">{r.report_id ?? <span className="text-ink-3">auto</span>}</td>
                    <td className="px-2 py-1">{r.site ?? <span className="text-ink-3">unknown</span>}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{r.report_date ?? <span className="text-ink-3">unknown</span>}</td>
                    <td className="px-2 py-1 text-ink-2">
                      {r.near_duplicate && <Chip tone="warn">near-dup</Chip>} {r.report_text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">Data provenance</legend>
          {(["operational", "synthetic"] as const).map((s) => (
            <label key={s} className={cx("mb-1.5 flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm", sourceType === s ? "border-accent bg-accent-soft" : "border-line")}>
              <input type="radio" name="src" className="mt-0.5 accent-[var(--accent)]" checked={sourceType === s} onChange={() => setSourceType(s)} />
              <span>
                <span className="font-medium">{s === "operational" ? "Operational reports" : "Synthetic / demo data"}</span>
                <span className="block text-xs text-ink-3">
                  {s === "operational" ? "Real field reports. Shown in operational views." : "Labelled synthetic everywhere; excluded from operational analytics by default."}
                </span>
              </span>
            </label>
          ))}
          {preview.row_source_types.length > 0 && <p className="text-xs text-ink-3">The file sets source_type per row ({preview.row_source_types.join(", ")}); row values take precedence.</p>}
          <input className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm" placeholder="Provenance note (optional), e.g. 'Site HSE export, Q1'" value={provenance} onChange={(e) => setProvenance(e.target.value)} />
          <input className="mt-2 h-9 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm" placeholder={`Batch name (default: ${preview.filename})`} value={name} onChange={(e) => setName(e.target.value)} />
        </fieldset>
        <EngineSelect value={engine} onChange={setEngine} sourceType={sourceType} />
      </div>

      {commit.error && <ErrorBox error={commit.error} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" loading={commit.isPending} disabled={preview.importable_rows === 0 && !preview.already_imported_batch} onClick={() => commit.mutate(false)}>
          <PlayCircle className="size-4" aria-hidden />
          {preview.already_imported_batch ? "Open existing batch" : `Import ${preview.importable_rows} rows & analyse`}
        </Button>
        {preview.already_imported_batch && (
          <Button variant="secondary" loading={commit.isPending} onClick={() => commit.mutate(true)} title="Creates a new batch; exact duplicate texts are still skipped">
            Import as a new batch anyway
          </Button>
        )}
      </div>
    </div>
  );
}

export function BatchProgress({ id }: { id: number }) {
  const qc = useQueryClient();
  const { data: b, error, refetch } = useQuery({
    queryKey: ["batch", id],
    queryFn: () => api.batch(id),
    refetchInterval: (q) => (q.state.data && ACTIVE.includes(q.state.data.status) ? 1000 : false),
  });
  const resume = useMutation({ mutationFn: () => api.resume(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["batch", id] }) });
  const retry = useMutation({ mutationFn: () => api.retryFailed(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["batch", id] }) });
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  if (!b) return <LoadingBlock rows={3} />;
  const pct = b.jobs.total ? Math.round((b.jobs.finished / b.jobs.total) * 100) : 100;
  const running = ACTIVE.includes(b.status);
  const scope = b.source_type === "synthetic" ? "&data=all" : "";
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          Batch #{b.id}: {b.name} {b.source_type === "synthetic" && <SyntheticChip />}
        </span>
      }
      subtitle={`Engine: ${b.engine === "baseline" ? "Rule-based baseline" : "LLM"} · created ${fmtDateTime(b.created_at)}`}
      actions={
        <Link to={`/reports?batch_id=${b.id}${scope}`} className="text-sm font-medium text-accent hover:underline">
          View reports →
        </Link>
      }
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {running ? "Analysing…" : titleCase(b.status)} {b.jobs.finished}/{b.jobs.total}
        </span>
        <span className="text-ink-3 tabular">{pct}%</span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={cx("h-full rounded-full transition-all", b.jobs.failed ? "bg-ins" : "bg-accent")} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <span>Imported {b.imported_rows} of {b.total_rows} rows</span>
        <span>Done {b.jobs.done}</span>
        <span className={b.jobs.failed ? "font-semibold text-sif" : ""}>Failed {b.jobs.failed}</span>
        {b.jobs.interrupted > 0 && <span className="font-semibold text-ins">Interrupted {b.jobs.interrupted}</span>}
        <span>Rejected rows {b.rejected_rows}</span>
        <span>Duplicates skipped {b.skipped_duplicates}</span>
        <span>Near-duplicates flagged {b.near_duplicates}</span>
      </div>
      {(b.jobs.interrupted > 0 || b.jobs.failed > 0) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {b.jobs.interrupted > 0 && (
            <Button size="sm" variant="primary" loading={resume.isPending} onClick={() => resume.mutate()}>
              <RotateCcw className="size-3.5" /> Resume {b.jobs.interrupted} interrupted
            </Button>
          )}
          {b.jobs.failed > 0 && (
            <Button size="sm" loading={retry.isPending} onClick={() => retry.mutate()}>
              <RotateCcw className="size-3.5" /> Retry {b.jobs.failed} failed
            </Button>
          )}
        </div>
      )}
      {b.failed_jobs.length > 0 && (
        <div className="mt-3 max-h-48 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface-2 text-ink-3">
              <tr>
                <th className="px-2 py-1.5">Report</th>
                <th className="px-2 py-1.5">Status</th>
                <th className="px-2 py-1.5">Error (never counted as non-SIF)</th>
              </tr>
            </thead>
            <tbody>
              {b.failed_jobs.map((j) => (
                <tr key={j.job_id} className="border-t border-line align-top">
                  <td className="px-2 py-1">
                    <Link className="text-accent hover:underline" to={`/reports/${j.report_id}`}>
                      {j.external_report_id ?? j.report_uid}
                    </Link>
                  </td>
                  <td className="px-2 py-1">{j.status}</td>
                  <td className="px-2 py-1 text-ink-2">{j.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {b.row_issues.filter((i) => i.severity !== "warning").length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-ink-2">Rows not imported ({b.row_issues.filter((i) => i.severity !== "warning").length})</summary>
          <ul className="mt-1 space-y-0.5 text-ink-2">
            {b.row_issues
              .filter((i) => i.severity !== "warning")
              .map((i, k) => (
                <li key={k}>
                  Row {i.row_number}: {i.message}
                </li>
              ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function ManualEntry() {
  const { data: meta } = useMeta();
  const nav = useNavigate();
  const [form, setForm] = useState({ report_text: "", report_id: "", site: "", report_date: "", report_type: "Near Miss", synthetic: false });
  const [engine, setEngine] = useState<string>(meta?.default_engine ?? "baseline");
  const create = useMutation({
    mutationFn: () =>
      api.createReport({
        report_text: form.report_text,
        report_id: form.report_id || null,
        site: form.site || null,
        report_date: form.report_date || null,
        report_type: form.report_type || null,
        engine,
        source_type: form.synthetic ? "synthetic" : "manual",
      }),
    onSuccess: (r) => nav(`/reports/${r.report_id}`),
  });
  const input = "h-9 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm";
  return (
    <Card title="Manual report entry" subtitle="Only the narrative is required. Unknown site/date stay unknown.">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <label className="block text-sm">
          <span className="font-medium">Report narrative *</span>
          <textarea
            required
            rows={6}
            maxLength={10000}
            className="mt-1 w-full rounded-lg border border-line-strong bg-surface p-2 text-sm"
            placeholder="Describe what happened or what was observed: task, hazard, who was nearby, which controls were or were not in place."
            value={form.report_text}
            onChange={(e) => setForm({ ...form, report_text: e.target.value })}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-ink-2">
            Report ID
            <input className={input} value={form.report_id} onChange={(e) => setForm({ ...form, report_id: e.target.value })} placeholder="auto if blank" />
          </label>
          <label className="text-xs text-ink-2">
            Site
            <input className={input} value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />
          </label>
          <label className="text-xs text-ink-2">
            Date
            <input type="date" className={input} value={form.report_date} onChange={(e) => setForm({ ...form, report_date: e.target.value })} />
          </label>
          <label className="text-xs text-ink-2">
            Type
            <select className={input} value={form.report_type} onChange={(e) => setForm({ ...form, report_type: e.target.value })}>
              <option>Near Miss</option>
              <option>Unsafe Act</option>
              <option>Unsafe Condition</option>
              <option value="">Unknown</option>
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-[var(--accent)]" checked={form.synthetic} onChange={(e) => setForm({ ...form, synthetic: e.target.checked })} />
          This is a synthetic / test narrative
        </label>
        <EngineSelect value={engine} onChange={setEngine} sourceType={form.synthetic ? "synthetic" : "manual"} />
        {create.error && <ErrorBox error={create.error} />}
        <Button type="submit" variant="primary" loading={create.isPending} disabled={!form.report_text.trim()}>
          Analyse report
        </Button>
      </form>
    </Card>
  );
}

export default function UploadPage() {
  const [params, setParams] = useSearchParams();
  const batchId = params.get("batch") ? Number(params.get("batch")) : null;
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const preview = useMutation({ mutationFn: (f: File) => api.preview(f) });
  const { data: batches, isLoading: loadingBatches } = useQuery({ queryKey: ["batches"], queryFn: api.batches, refetchInterval: 4000 });
  const { data: samples } = useQuery({ queryKey: ["samples"], queryFn: api.samples });

  const choose = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    preview.mutate(f);
  };

  return (
    <>
      <PageHeader
        title="Upload & Analyse"
        description="Import a CSV of unsafe-act / unsafe-condition / near-miss reports, check the validation preview, then queue analysis. Progress is stored server-side, so you can leave this page and come back."
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {batchId && <BatchProgress id={batchId} />}
          <Card
            title="CSV import"
            subtitle="Required column: report_text. Optional: report_id, site, report_date, report_type (and source_type, provenance)."
            actions={
              <a href="/api/imports/template.csv" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                <Download className="size-4" aria-hidden /> Template
              </a>
            }
          >
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                choose(e.dataTransfer.files?.[0]);
              }}
              className={cx("flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center", drag ? "border-accent bg-accent-soft" : "border-line-strong")}
            >
              <FileUp className="size-8 text-ink-3" aria-hidden />
              <p className="text-sm text-ink-2">Drag a .csv file here, or</p>
              <Button variant="primary" onClick={() => inputRef.current?.click()}>
                Choose file
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  choose(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {samples && samples.some((s) => s.available) && (
                <p className="mt-1 text-xs text-ink-3">
                  Demo files:{" "}
                  {samples
                    .filter((s) => s.available)
                    .map((s, i) => (
                      <span key={s.name}>
                        {i > 0 && " · "}
                        <a className="text-accent hover:underline" href={`/api/imports/samples/${s.name}`} title={s.description}>
                          {s.name}
                        </a>
                      </span>
                    ))}
                </p>
              )}
            </div>
            {file && (
              <div className="mt-4">
                <div className="mb-3 flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-non" aria-hidden />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-ink-3">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
                {preview.isPending && <LoadingBlock rows={4} label="Validating file" />}
                {preview.error && <ErrorBox error={preview.error} />}
                {preview.data && (
                  <PreviewPanel
                    key={preview.data.file_sha256}
                    file={file}
                    preview={preview.data}
                    onDone={(b) => {
                      setFile(null);
                      preview.reset();
                      qc.invalidateQueries();
                      setParams({ batch: String(b.id) });
                    }}
                  />
                )}
              </div>
            )}
          </Card>

          <Card title="Recent batches" bodyClass="p-0">
            {loadingBatches ? (
              <div className="p-4">
                <LoadingBlock rows={3} />
              </div>
            ) : !batches?.length ? (
              <EmptyState title="No batches yet">Upload a CSV or enter a report manually to start.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-2 text-xs text-ink-3">
                    <tr>
                      <th className="px-3 py-2">Batch</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Progress</th>
                      <th className="px-3 py-2">Engine</th>
                      <th className="px-3 py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr key={b.id} className={cx("border-t border-line", batchId === b.id && "bg-accent-soft")}>
                        <td className="px-3 py-2">
                          <button className="text-left font-medium text-accent hover:underline" onClick={() => setParams({ batch: String(b.id) })}>
                            #{b.id} {b.name}
                          </button>{" "}
                          {b.source_type === "synthetic" && <SyntheticChip compact />}
                        </td>
                        <td className="px-3 py-2">
                          <span className={cx("text-xs font-semibold", b.status === "completed" ? "text-non" : b.status.includes("error") || b.status === "interrupted" ? "text-ins" : "text-accent")}>{titleCase(b.status)}</span>
                        </td>
                        <td className="px-3 py-2 tabular text-ink-2">
                          {b.jobs.finished}/{b.jobs.total}
                          {b.jobs.failed > 0 && <span className="text-sif"> · {b.jobs.failed} failed</span>}
                        </td>
                        <td className="px-3 py-2 text-ink-2">{b.engine}</td>
                        <td className="px-3 py-2 text-ink-3">{fmtDateTime(b.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <div>
          <ManualEntry />
        </div>
      </div>
    </>
  );
}
