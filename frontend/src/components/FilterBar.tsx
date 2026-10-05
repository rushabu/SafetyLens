import { ChevronDown, FilterX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { activeFilterCount, useGlobalFilters } from "../lib/filters";
import { useFilterOptions } from "../lib/queries";
import { cx } from "./ui";

function MultiSelect({ label, options, value, onChange }: { label: string; options: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const summary = value.length === 0 ? "All" : value.length === 1 ? (options.find((o) => o.id === value[0])?.label ?? value[0]) : `${value.length} selected`;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx("flex h-9 min-w-[150px] items-center justify-between gap-2 rounded-lg border bg-surface px-2.5 text-sm transition-colors hover:border-accent/40", value.length ? "border-accent/60 bg-accent-soft/50" : "border-line-strong")}
      >
        <span className="text-ink-3">{label}:</span>
        <span className="max-w-[140px] truncate text-ink">{summary}</span>
        <ChevronDown className="size-4 text-ink-3" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1.5 max-h-72 w-64 overflow-auto rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-pop)]">
          {options.length === 0 && <div className="px-2 py-1.5 text-sm text-ink-3">No values yet</div>}
          {options.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
              <input
                type="checkbox"
                checked={value.includes(o.id)}
                onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))}
                className="accent-[var(--accent)]"
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
          {value.length > 0 && (
            <button className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-accent hover:bg-surface-2" onClick={() => onChange([])}>
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** One row of filters shared by Overview, Reports and Patterns (state lives in the URL). */
export default function FilterBar({ showView = true }: { showView?: boolean }) {
  const { filters, update, reset } = useGlobalFilters();
  const { data: opts } = useFilterOptions();
  const n = activeFilterCount(filters);
  const input = "h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink";

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/90 p-2 shadow-[var(--shadow-card)] backdrop-blur" role="region" aria-label="Filters">
      {showView && (
        <div className="flex h-9 gap-0.5 rounded-lg bg-surface-2 p-0.5 text-[13px] ring-1 ring-line ring-inset" role="group" aria-label="Assessment view">
          {(["model", "reviewed"] as const).map((v) => (
            <button
              key={v}
              onClick={() => update({ view: v })}
              aria-pressed={filters.view === v}
              className={cx("rounded-md px-3 font-medium transition-all", filters.view === v ? "bg-surface text-accent shadow-[0_1px_3px_rgba(11,26,61,0.12)] ring-1 ring-line" : "text-ink-3 hover:text-ink")}
            >
              {v === "model" ? "Model-assessed" : "Reviewer-confirmed"}
            </button>
          ))}
        </div>
      )}
      <span className="mx-1 hidden h-5 w-px bg-line md:block" aria-hidden />
      <label className="flex items-center gap-1.5 text-[13px] text-ink-3">
        From
        <input type="date" className={input} value={filters.date_from} min={opts?.date_min ?? undefined} max={opts?.date_max ?? undefined} onChange={(e) => update({ date_from: e.target.value })} />
      </label>
      <label className="flex items-center gap-1.5 text-[13px] text-ink-3">
        To
        <input type="date" className={input} value={filters.date_to} min={opts?.date_min ?? undefined} max={opts?.date_max ?? undefined} onChange={(e) => update({ date_to: e.target.value })} />
      </label>
      <MultiSelect label="Site" options={(opts?.sites ?? []).map((s) => ({ id: s, label: s }))} value={filters.sites} onChange={(v) => update({ sites: v })} />
      <MultiSelect label="Activity" options={opts?.activities ?? []} value={filters.activities} onChange={(v) => update({ activities: v })} />
      <label className="flex items-center gap-1.5 text-[13px] text-ink-3">
        Data
        <select className={input} value={filters.data} onChange={(e) => update({ data: e.target.value as "ops" | "all" | "synthetic" })}>
          <option value="ops">Operational + manual</option>
          <option value="all">Include synthetic</option>
          <option value="synthetic">Synthetic only</option>
        </select>
      </label>
      <label className="flex cursor-pointer items-center gap-1.5 px-1 text-[13px] text-ink-2" title="Probable near-duplicates are flagged at import. Exact duplicates are never imported.">
        <input type="checkbox" className="accent-[var(--accent)]" checked={filters.near_dup} onChange={(e) => update({ near_dup: e.target.checked })} />
        Include near-duplicates
      </label>
      {n > 0 && (
        <button onClick={reset} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-accent hover:bg-surface-2">
          <FilterX className="size-3.5" aria-hidden /> Reset filters ({n})
        </button>
      )}
    </div>
  );
}
