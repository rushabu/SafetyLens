import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: api.meta, staleTime: 5 * 60_000 });
}

export function useFilterOptions() {
  return useQuery({ queryKey: ["filter-options"], queryFn: api.filterOptions, staleTime: 30_000 });
}

export function useRuleLabels(): Record<string, string> {
  const { data } = useMeta();
  return Object.fromEntries((data?.taxonomy.rules ?? []).map((r) => [r.id, r.label]));
}
