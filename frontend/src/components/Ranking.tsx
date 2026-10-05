import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Counts } from "../types";
import { EmptyState, cx } from "./ui";

type Row = Counts & { key: string; label?: string };

const UNKNOWN_KEYS = new Set(["unknown", "Unknown site"]);
const rankable = (r: Row) => !r.small_sample && !UNKNOWN_KEYS.has(r.key);
type RankBy = "density" | "sif" | "volume";

/** Density with its 95% range: point on a track, interval as a band. Shows n/N, never a bare %. */
export function DensityRange({ sif, det, low, high, small }: { sif: number; det: number; low?: number | null; high?: number | null; small: boolean }) {
  if (!det) return <span className="text-xs text-ink-3">no determinate reports</span>;
  const p = sif / det;
  const lo = low ?? p;
  const hi = high ?? p;
  return (
    <div className="flex items-center gap-2.5" title={`${sif} of ${det} determinate reports flagged SIF. 95% range ${Math.round(lo * 100)}–${Math.round(hi * 100)}% (sample-size uncertainty only).`}>
      <div className="relative h-2 w-28 rounded-full bg-surface-2" aria-hidden>
        <div className="bar-grow absolute inset-y-0 rounded-full" style={{ left: `${lo * 100}%`, width: `${Math.max(2, (hi - lo) * 100)}%`, background: "var(--line-art-soft)", opacity: 0.55 }} />
        <div className="dot-pop absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--surface)]" style={{ left: `${p * 100}%`, background: small ? "var(--ink-3)" : "var(--series-2)" }} />
      </div>
      <span className="text-xs font-medium tabular text-ink">{Math.round(p * 100)}%</span>
      <span className="text-[11px] tabular text-ink-3">
        {sif}/{det}
      </span>
      <span className="hidden text-[11px] tabular text-ink-3 xl:inline">
        ({Math.round(lo * 100)}–{Math.round(hi * 100)}%)
      </span>
    </div>
  );
}

export default function RankingTable({ rows, keyLabel, threshold, view, linkFor }: { rows: Row[]; keyLabel: string; threshold: number; view: string; linkFor: (k: string) => string }) {
  const [rankBy, setRankBy] = useState<RankBy>("density");
  const [showSmall, setShowSmall] = useState(false);

  const { ranked, small } = useMemo(() => {
    const big = rows.filter(rankable);
    const sm = rows.filter((r) => !rankable(r)).sort((a, b) => b.total - a.total);
    const cmp: Record<RankBy, (a: Row, b: Row) => number> = {
      density: (a, b) => (b.density ?? 0) - (a.density ?? 0) || b.determinate - a.determinate,
      sif: (a, b) => b.sif - a.sif || (b.density ?? 0) - (a.density ?? 0),
      volume: (a, b) => b.total - a.total,
    };
    return { ranked: [...big].sort(cmp[rankBy]), small: sm };
  }, [rows, rankBy]);

  if (!rows.length) return <EmptyState title="No data in scope" />;

  const head = (
    <tr className="border-b border-line text-xs text-ink-3">
      <th className="w-10 py-2 pr-2 font-medium">#</th>
      <th className="py-2 pr-3 font-medium">{keyLabel}</th>
      <th className="py-2 font-medium">Reported SIF-precursor density</th>
      <th className="py-2 pr-3 text-right font-medium">SIF</th>
      <th className="py-2 pr-3 text-right font-medium">Determinate</th>
      <th className="py-2 pr-3 text-right font-medium">Insufficient</th>
      <th className="py-2 pr-3 text-right font-medium">Reports</th>
      <th className="py-2 text-right font-medium">{view === "reviewed" ? "Unreviewed" : "Errors"}</th>
    </tr>
  );
  const line = (r: Row, rank: number | null) => (
    <tr key={r.key} className="border-b border-line last:border-0">
      <td className="py-2 pr-2 text-sm font-semibold tabular text-ink-3">{rank ?? "–"}</td>
      <td className="py-2 pr-3">
        <Link to={linkFor(r.key)} className="font-medium text-accent hover:underline">
          {r.label ?? r.key}
        </Link>
      </td>
      <td className="py-2">
        <DensityRange sif={r.sif} det={r.determinate} low={r.density_low} high={r.density_high} small={r.small_sample} />
      </td>
      <td className="py-2 pr-3 text-right tabular">{r.sif}</td>
      <td className="py-2 pr-3 text-right tabular">{r.determinate}</td>
      <td className="py-2 pr-3 text-right tabular">{r.insufficient}</td>
      <td className="py-2 pr-3 text-right tabular">{r.total}</td>
      <td className="py-2 text-right tabular text-ink-3">{view === "reviewed" ? r.unreviewed : (r.processing_errors ?? 0)}</td>
    </tr>
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink-3">Rank by</span>
        <div className="flex overflow-hidden rounded-lg border border-line-strong" role="group" aria-label="Rank by">
          {(
            [
              ["density", "SIF-precursor density"],
              ["sif", "SIF count"],
              ["volume", "Report volume"],
            ] as [RankBy, string][]
          ).map(([k, l]) => (
            <button key={k} onClick={() => setRankBy(k)} aria-pressed={rankBy === k} className={cx("px-2.5 py-1", rankBy === k ? "bg-accent text-accent-ink" : "bg-surface text-ink-2 hover:bg-surface-2")}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>{head}</thead>
          <tbody>
            {ranked.length ? (
              ranked.map((r, i) => line(r, i + 1))
            ) : (
              <tr>
                <td colSpan={8} className="py-3 text-center text-xs text-ink-3">
                  No group has {threshold}+ determinate reports yet — nothing can be ranked reliably.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {small.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setShowSmall((s) => !s)} className="inline-flex items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink" aria-expanded={showSmall}>
            {showSmall ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {small.length} not ranked — fewer than {threshold} determinate reports, or {keyLabel.toLowerCase()} unknown
          </button>
          {showSmall && (
            <div className="mt-1 overflow-x-auto rounded-lg bg-surface-2/60 px-2">
              <table className="w-full min-w-[760px] text-left text-sm">
                <tbody>{small.map((r) => line(r, null))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <p className="mt-2 flex gap-1.5 text-[11px] leading-relaxed text-ink-3">
        <Info className="mt-0.5 size-3 shrink-0" />
        Report-based density (SIF ÷ determinate reports), not exposure-adjusted risk: it also reflects reporting culture and volume. The shaded band is a 95% range from sample size alone. Only groups with ≥ {threshold} determinate reports are ranked.
      </p>
    </div>
  );
}
