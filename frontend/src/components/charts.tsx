import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReactNode } from "react";

const axis = { stroke: "var(--ink-3)", fontSize: 11, tickLine: false, axisLine: { stroke: "var(--grid)" } } as const;

function TipBox({ title, rows }: { title: ReactNode; rows: { label: string; value: ReactNode; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            {r.color && <span className="inline-block size-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="font-medium tabular text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export interface TrendPoint {
  label: string;
  total: number;
  sif: number;
  determinate: number;
  density: number | null;
  insufficient: number;
}

/** Two count series on one axis (same unit). Density stays in the tooltip/table - never a second axis. */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="label" {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip
            cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TipBox
                  title={label}
                  rows={[
                    { label: "Reports", value: payload[0].payload.total, color: "var(--series-1)" },
                    { label: "SIF-flagged", value: payload[0].payload.sif, color: "var(--series-2)" },
                    { label: "Insufficient info", value: payload[0].payload.insufficient },
                    {
                      label: "Density (SIF / determinate)",
                      value: payload[0].payload.density === null ? "—" : `${payload[0].payload.sif}/${payload[0].payload.determinate}`,
                    },
                  ]}
                />
              ) : null
            }
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: "var(--ink-2)" }} />
          <Line isAnimationActive={false} type="monotone" dataKey="total" name="Reports" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)", fill: "var(--series-1)" }} activeDot={{ r: 5 }} />
          <Line isAnimationActive={false} type="monotone" dataKey="sif" name="SIF-flagged reports" stroke="var(--series-2)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)", fill: "var(--series-2)" }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface HBarDatum {
  key: string;
  label: string;
  value: number;
  tip: { label: string; value: ReactNode }[];
}

/** Single-series horizontal bars: thin, 4px rounded data-end, value labelled at the tip. */
export function HBarChart({ data, valueLabel, onSelect }: { data: HBarDatum[]; valueLabel: string; onSelect?: (key: string) => void }) {
  const height = Math.max(120, data.length * 30 + 24);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 36, left: 0, bottom: 0 }} barCategoryGap={8}>
          <CartesianGrid stroke="var(--grid)" horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...axis} />
          <YAxis type="category" dataKey="label" width={190} {...axis} tick={{ fill: "var(--ink-2)", fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) =>
              active && payload?.length ? <TipBox title={payload[0].payload.label} rows={[{ label: valueLabel, value: payload[0].payload.value, color: "var(--series-1)" }, ...payload[0].payload.tip]} /> : null
            }
          />
          <Bar
            dataKey="value"
            isAnimationActive={false}
            fill="var(--series-1)"
            radius={[0, 4, 4, 0]}
            barSize={14}
            label={{ position: "right", fill: "var(--ink-2)", fontSize: 11 }}
            onClick={onSelect ? (d: { payload?: HBarDatum }) => d.payload && onSelect(d.payload.key) : undefined}
            cursor={onSelect ? "pointer" : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Inline density bar for tables: shows n/N, never a bare percentage. */
export function DensityCell({ sif, det, small }: { sif: number; det: number; small: boolean }) {
  if (!det) return <span className="text-xs text-ink-3">no determinate reports</span>;
  const p = sif / det;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="bar-grow h-full rounded-full" style={{ width: `${p * 100}%`, background: small ? "var(--ink-3)" : "var(--series-2)" }} />
      </div>
      <span className="text-xs tabular text-ink">
        {sif}/{det}
      </span>
      <span className="text-[11px] tabular text-ink-3">({Math.round(p * 100)}%)</span>
    </div>
  );
}
