import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/** Global filters live in the URL so Overview, Reports, Patterns and exports stay consistent. */
export type DataScope = "ops" | "all" | "synthetic";

export interface GlobalFilters {
  date_from: string;
  date_to: string;
  sites: string[];
  activities: string[];
  data: DataScope;
  near_dup: boolean;
  view: "model" | "reviewed";
}

export const GLOBAL_KEYS = ["date_from", "date_to", "site", "activity", "data", "near_dup", "view"];

export function sourceTypes(scope: DataScope): string[] {
  if (scope === "all") return ["operational", "manual", "synthetic"];
  if (scope === "synthetic") return ["synthetic"];
  return ["operational", "manual"];
}

export function useGlobalFilters() {
  const [params, setParams] = useSearchParams();

  const filters: GlobalFilters = useMemo(
    () => ({
      date_from: params.get("date_from") ?? "",
      date_to: params.get("date_to") ?? "",
      sites: params.getAll("site"),
      activities: params.getAll("activity"),
      data: (params.get("data") as DataScope) || "ops",
      near_dup: params.get("near_dup") !== "0",
      view: params.get("view") === "reviewed" ? "reviewed" : "model",
    }),
    [params],
  );

  const update = useCallback(
    (patch: Partial<GlobalFilters>, extra?: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const set = (k: string, v: string | null | undefined) => {
            if (v === null || v === undefined || v === "") next.delete(k);
            else next.set(k, v);
          };
          if ("date_from" in patch) set("date_from", patch.date_from);
          if ("date_to" in patch) set("date_to", patch.date_to);
          if ("sites" in patch) {
            next.delete("site");
            patch.sites?.forEach((s) => next.append("site", s));
          }
          if ("activities" in patch) {
            next.delete("activity");
            patch.activities?.forEach((a) => next.append("activity", a));
          }
          if ("data" in patch) set("data", patch.data === "ops" ? null : patch.data);
          if ("near_dup" in patch) set("near_dup", patch.near_dup ? null : "0");
          if ("view" in patch) set("view", patch.view === "model" ? null : patch.view);
          if (extra) Object.entries(extra).forEach(([k, v]) => set(k, v));
          if (!extra || !("page" in extra)) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const reset = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      GLOBAL_KEYS.forEach((k) => next.delete(k));
      next.delete("page");
      return next;
    });
  }, [setParams]);

  /** Query string for the API (expands the data scope into source_type params). */
  const apiQuery = useMemo(() => toApiQuery(filters), [filters]);

  /** Query string to carry the global filters across navigation links. */
  const linkQuery = useMemo(() => {
    const q = new URLSearchParams();
    GLOBAL_KEYS.forEach((k) => params.getAll(k).forEach((v) => q.append(k, v)));
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [params]);

  return { filters, update, reset, apiQuery, linkQuery, params, setParams };
}

export function toApiQuery(f: GlobalFilters, extra?: URLSearchParams): string {
  const q = new URLSearchParams(extra);
  if (f.date_from) q.set("date_from", f.date_from);
  if (f.date_to) q.set("date_to", f.date_to);
  f.sites.forEach((s) => q.append("site", s));
  f.activities.forEach((a) => q.append("activity", a));
  sourceTypes(f.data).forEach((s) => q.append("source_type", s));
  q.set("include_near_duplicates", String(f.near_dup));
  q.set("view", f.view);
  return q.toString();
}

export function activeFilterCount(f: GlobalFilters): number {
  return (
    (f.date_from ? 1 : 0) +
    (f.date_to ? 1 : 0) +
    f.sites.length +
    f.activities.length +
    (f.data !== "ops" ? 1 : 0) +
    (f.near_dup ? 0 : 1)
  );
}
