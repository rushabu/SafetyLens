import { cx } from "./ui";

/** SafetyLens mark: a lens over an engraved horizon. (Not an Oil India Limited logo.) */
export function LensMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cx("shrink-0", className)} aria-hidden fill="none">
      <rect x="1" y="1" width="38" height="38" rx="10" fill="var(--accent)" />
      <circle cx="17.5" cy="17.5" r="9.5" stroke="var(--accent-ink)" strokeWidth="2.6" />
      <path d="M24.5 24.5L31 31" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" />
      <path d="M10.5 19.5c2-2.6 3.4-2.6 5 0s3 2.6 5 0 3-2.6 4.5 0" stroke="var(--accent-ink)" strokeWidth="1.3" strokeLinecap="round" opacity="0.85" />
      <path d="M11 15.5h13" stroke="var(--accent-ink)" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export function Wordmark({ sub = true, className }: { sub?: boolean; className?: string }) {
  return (
    <div className={cx("flex items-center gap-2.5", className)}>
      <LensMark className="size-9" />
      <div className="leading-tight">
        <div className="font-display text-[19px] font-semibold tracking-tight text-ink">SafetyLens</div>
        {sub && <div className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3">for Oil India Limited</div>}
      </div>
    </div>
  );
}

/** Thin engraved double rule with a centre diamond, used as a section ornament. */
export function Ornament({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 10" className={cx("h-2.5 w-40", className)} aria-hidden fill="none" stroke="var(--line-art)">
      <path d="M0 3.5H70M0 6.5H70M90 3.5H160M90 6.5H160" strokeWidth="0.8" opacity="0.7" />
      <path d="M80 0.5L84.5 5L80 9.5L75.5 5Z" strokeWidth="1" />
    </svg>
  );
}
