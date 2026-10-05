import type { Assessment, ModelStatus } from "../types";

export const ASSESSMENT_LABEL: Record<ModelStatus, string> = {
  SIF_POTENTIAL: "SIF potential",
  NON_SIF_POTENTIAL: "Non-SIF potential",
  INSUFFICIENT_INFORMATION: "Insufficient info",
  PROCESSING_ERROR: "Processing error",
  PENDING: "Pending",
};

export const ASSESSMENTS: Assessment[] = ["SIF_POTENTIAL", "NON_SIF_POTENTIAL", "INSUFFICIENT_INFORMATION"];

export function pct(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

export function num(x: number | null | undefined): string {
  if (x === null || x === undefined) return "—";
  return x.toLocaleString();
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "Unknown";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "Unknown";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function metric(x: number | null | undefined): string {
  if (x === null || x === undefined) return "—";
  return x.toFixed(2);
}
