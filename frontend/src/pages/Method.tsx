import { ExternalLink } from "lucide-react";
import { PageHeader } from "../components/Layout";
import { AssessmentBadge, Card, ErrorBox, LoadingBlock, Notice } from "../components/ui";
import { useMeta } from "../lib/queries";
import type { Assessment } from "../types";

export default function MethodPage() {
  const { data: m, error, isLoading } = useMeta();
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !m) return <LoadingBlock rows={8} />;
  return (
    <>
      <PageHeader title="Method & taxonomy" description="The versioned rubric, taxonomy and engines behind every assessment." />
      <div className="space-y-4">
        <Card title={`SIF rubric ${m.rubric.version}`} subtitle={m.rubric.owner_note}>
          <div className="mb-3">
            <Notice tone="warn">Status: {m.rubric.status}. This is a proposed prototype rubric awaiting alignment with OIL's domain definition of SIF.</Notice>
          </div>
          <ul className="space-y-2">
            {(Object.entries(m.rubric.classes) as [Assessment, string][]).map(([k, v]) => (
              <li key={k} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                <div className="w-48 shrink-0">
                  <AssessmentBadge value={k} />
                </div>
                <p className="text-sm text-ink-2">{v}</p>
              </li>
            ))}
          </ul>
          <h3 className="mt-4 text-sm font-semibold">Principles</h3>
          <ul className="ml-5 mt-1 list-disc space-y-1 text-sm text-ink-2">
            {m.rubric.principles.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Card>

        <Card title={`IOGP Life-Saving Rules · ${m.taxonomy.version}`} subtitle={m.taxonomy.source_note}>
          <div className="grid gap-2 md:grid-cols-3">
            {m.taxonomy.rules.map((r) => (
              <div key={r.id} className="rounded-lg border border-line p-3">
                <div className="text-sm font-semibold">
                  <span className="tabular text-ink-3">{r.id}</span> {r.label}
                </div>
                <p className="mt-1 text-xs text-ink-2">{r.scope_note}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 text-xs">
            {m.taxonomy.source_urls.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent hover:underline">
                <ExternalLink className="size-3" /> {u}
              </a>
            ))}
          </div>
          <h3 className="mt-4 text-sm font-semibold">Other hazards (kept outside the rule list)</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {m.taxonomy.other_hazards.map((o) => (
              <span key={o.id} className="rounded border border-line px-1.5 py-0.5 text-xs text-ink-2">
                {o.label}
              </span>
            ))}
          </div>
        </Card>

        <Card title="Analysis engines">
          <ul className="space-y-2 text-sm">
            {m.engines.map((e) => (
              <li key={e.id}>
                <span className="font-semibold">{e.label}</span> {!e.available && <span className="text-ink-3">(not configured)</span>}
                <p className="text-ink-2">{e.description}</p>
                {e.version && <p className="text-xs text-ink-3">Version {e.version}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-3">
            Both engines return the same schema. Every evidence quote is checked against the original text; quotes that cannot be found are removed and never displayed as support. An engine failure is stored as a processing error and is never converted into a non-SIF assessment. Baseline lexicon {m.lexicon_version}.
          </p>
        </Card>
      </div>
    </>
  );
}
