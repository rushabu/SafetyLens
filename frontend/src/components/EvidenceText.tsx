import { Fragment, useMemo } from "react";
import type { AnalysisOutput, Span } from "../types";
import { cx } from "./ui";

export type Family = "hazard" | "exposure" | "barrier-failed" | "barrier-ok" | "rule" | "other";

export const FAMILY_LABEL: Record<Family, string> = {
  hazard: "Harm mechanism",
  exposure: "Exposure",
  "barrier-failed": "Failed / absent barrier",
  "barrier-ok": "Effective barrier",
  rule: "Rule evidence",
  other: "Context (activity, consequence, other)",
};

const PRIORITY: Family[] = ["barrier-failed", "exposure", "hazard", "barrier-ok", "rule", "other"];

export function spanKey(s: Pick<Span, "owner_type" | "owner_key">) {
  return `${s.owner_type}:${s.owner_key}`;
}

export function familyOf(s: Span, output: AnalysisOutput | null): Family {
  switch (s.owner_type) {
    case "hazard":
      return "hazard";
    case "exposure":
      return "exposure";
    case "barrier": {
      const b = output?.barriers.find((x) => x.category === s.owner_key);
      return b?.status === "failed" ? "barrier-failed" : b?.status === "effective" ? "barrier-ok" : "other";
    }
    case "rule_tag":
      return "rule";
    default:
      return "other";
  }
}

interface Props {
  text: string;
  spans: Span[];
  output: AnalysisOutput | null;
  visible: Set<Family>;
  activeKey: string | null;
  onHover: (key: string | null) => void;
  labelFor: (s: Span) => string;
}

/** Renders the ORIGINAL report text with exact-offset evidence highlights (overlaps supported). */
export default function EvidenceText({ text, spans, output, visible, activeKey, onHover, labelFor }: Props) {
  const segments = useMemo(() => {
    const shown = spans.filter((s) => s.start >= 0 && s.end <= text.length && s.start < s.end && visible.has(familyOf(s, output)));
    const cuts = new Set<number>([0, text.length]);
    shown.forEach((s) => {
      cuts.add(s.start);
      cuts.add(s.end);
    });
    const pts = [...cuts].sort((a, b) => a - b);
    const out: { start: number; end: number; covering: Span[] }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a === b) continue;
      out.push({ start: a, end: b, covering: shown.filter((s) => s.start <= a && s.end >= b) });
    }
    return out;
  }, [text, spans, output, visible]);

  return (
    <p className="whitespace-pre-wrap text-[15px] leading-8 text-ink">
      {segments.map((seg) => {
        const piece = text.slice(seg.start, seg.end);
        if (!seg.covering.length) return <Fragment key={seg.start}>{piece}</Fragment>;
        const fams = seg.covering.map((s) => familyOf(s, output));
        const top = PRIORITY.find((p) => fams.includes(p)) ?? "other";
        const keys = seg.covering.map(spanKey);
        const active = activeKey !== null && keys.includes(activeKey);
        const title = [...new Set(seg.covering.map(labelFor))].join("\n");
        return (
          <mark
            key={seg.start}
            className={cx("ev", `ev-${top}`, active && "active")}
            title={title}
            onMouseEnter={() => onHover(keys[0])}
            onMouseLeave={() => onHover(null)}
          >
            {piece}
          </mark>
        );
      })}
    </p>
  );
}
