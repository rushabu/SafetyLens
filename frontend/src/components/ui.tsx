import { AlertOctagon, AlertTriangle, CheckCircle2, Clock, FlaskConical, HelpCircle, Inbox, Loader2, RefreshCw } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ASSESSMENT_LABEL } from "../lib/format";
import { AnimatedValue } from "./motion";
import type { ModelStatus, RuleStatus } from "../types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ title, subtitle, actions, children, className, bodyClass }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cx("rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line/70 px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-[14.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx("p-5", bodyClass)}>{children}</div>
    </section>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; loading?: boolean };

export function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...rest }: BtnProps) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-[background-color,box-shadow,filter,border-color] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50";
  const sizes = { sm: "h-8 px-3 text-xs", md: "h-9 px-3.5 text-sm" };
  const variants = {
    primary:
      "bg-[linear-gradient(180deg,var(--accent-2),var(--accent))] text-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_6px_16px_-8px_var(--accent)] hover:brightness-[1.06]",
    secondary: "border border-line-strong bg-surface text-ink shadow-[0_1px_2px_rgba(11,26,61,0.04)] hover:border-accent/40 hover:bg-surface-2",
    ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
    danger: "border border-sif/40 bg-sif-bg text-sif hover:brightness-[0.98]",
  };
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const STATUS_STYLE: Record<ModelStatus, { cls: string; Icon: typeof AlertTriangle }> = {
  SIF_POTENTIAL: { cls: "bg-sif-bg text-sif border-sif/30", Icon: AlertTriangle },
  NON_SIF_POTENTIAL: { cls: "bg-non-bg text-non border-non/30", Icon: CheckCircle2 },
  INSUFFICIENT_INFORMATION: { cls: "bg-ins-bg text-ins border-ins/30", Icon: HelpCircle },
  PROCESSING_ERROR: { cls: "bg-err-bg text-err border-err/30", Icon: AlertOctagon },
  PENDING: { cls: "bg-pend-bg text-pend border-pend/30", Icon: Clock },
};

/** Assessment badge: colour + icon + text, never colour alone. */
export function AssessmentBadge({ value, size = "md", prefix }: { value: ModelStatus | null | undefined; size?: "sm" | "md" | "lg"; prefix?: string }) {
  const v = (value ?? "PENDING") as ModelStatus;
  const { cls, Icon } = STATUS_STYLE[v];
  const sizes = { sm: "text-[11px] px-2 py-0.5 gap-1", md: "text-xs px-2.5 py-0.5 gap-1", lg: "text-sm px-3 py-1 gap-1.5" };
  return (
    <span className={cx("inline-flex items-center whitespace-nowrap rounded-full border font-semibold", cls, sizes[size])}>
      <Icon className={size === "lg" ? "size-4" : "size-3.5"} aria-hidden />
      {prefix && <span className="font-normal opacity-80">{prefix}</span>}
      {ASSESSMENT_LABEL[v]}
    </span>
  );
}

const RULE_STATUS: Record<RuleStatus, string> = {
  breach: "border-sif/40 text-sif",
  control: "border-non/40 text-non",
  unclear: "border-line-strong text-ink-2",
};

export function RuleChip({ id, status, label, title }: { id: string; status?: RuleStatus; label?: string; title?: string }) {
  return (
    <span
      title={title ?? (label ? `${id} ${label}${status ? ` — ${status}` : ""}` : undefined)}
      className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-md border bg-surface px-1.5 py-0.5 text-[11px] font-medium tabular", status ? RULE_STATUS[status] : "border-line-strong text-ink-2")}
    >
      {id}
      {label && <span className="font-normal text-ink-2">{label}</span>}
      {status && <span className="font-normal opacity-80">· {status}</span>}
    </span>
  );
}

export function SyntheticChip({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-ins/50 bg-ins-bg px-1.5 py-0.5 text-[10.5px] font-semibold text-ins" title="Synthetic development/demo data - not real reports">
      <FlaskConical className="size-3" aria-hidden />
      {compact ? "SYN" : "Synthetic"}
    </span>
  );
}

export function Chip({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "accent" | "warn"; title?: string }) {
  const tones = {
    neutral: "border-line-strong text-ink-2 bg-surface",
    accent: "border-accent/40 text-accent bg-accent-soft",
    warn: "border-ins/40 text-ins bg-ins-bg",
  };
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}

export function LoadingBlock({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <span className="mb-1 grid size-12 place-items-center rounded-2xl border border-line bg-surface-2 text-accent">
        <Inbox className="size-5" aria-hidden />
      </span>
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="max-w-md text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-sif/30 bg-sif-bg px-3 py-2.5 text-sm text-sif">
      <AlertOctagon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 break-words">{msg}</div>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1 text-xs font-semibold underline">
          <RefreshCw className="size-3" aria-hidden /> Retry
        </button>
      )}
    </div>
  );
}

export function Notice({ tone = "info", children, icon }: { tone?: "info" | "warn"; children: ReactNode; icon?: ReactNode }) {
  return (
    <div className={cx("flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed", tone === "warn" ? "border-ins/30 bg-ins-bg text-ins" : "border-accent/15 bg-accent-soft/70 text-ink-2 [&_svg]:text-accent")}>
      {icon}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "sif" | "ins" | "err" | "non" }) {
  const toneCls = tone ? { sif: "text-sif", ins: "text-ins", err: "text-err", non: "text-non" }[tone] : "text-ink";
  const dot = tone ? { sif: "bg-sif", ins: "bg-ins", err: "bg-err", non: "bg-non" }[tone] : "bg-accent";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)]">
      <div className="flex items-start gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-3">
        <span className={cx("mt-[5px] size-1.5 shrink-0 rounded-full", dot)} aria-hidden />
        <span className="leading-snug">{label}</span>
      </div>
      <div className={cx("mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular", toneCls)}>
        <AnimatedValue value={value} />
      </div>
      {sub && <div className="mt-1.5 text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

export function SmallSampleFlag({ n, threshold }: { n: number; threshold: number }) {
  if (n >= threshold) return null;
  return (
    <span title={`Fewer than ${threshold} determinate reports: do not rank or compare`} className="ml-1 inline-flex items-center rounded border border-ins/40 bg-ins-bg px-1 text-[10px] font-semibold text-ins">
      small n
    </span>
  );
}
