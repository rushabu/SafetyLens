import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** True once the element has scrolled into view (stays true). */
export function useInView<T extends Element>(rootMargin = "0px 0px -8% 0px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined" || reducedMotion()) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, rootMargin]);
  return [ref, seen] as const;
}

/** Fades and lifts its content in when it first scrolls into view. `delay` staggers siblings (ms). */
export function Reveal({ children, delay = 0, className, as = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" | "section" }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const Tag = as as "div";
  return (
    <Tag ref={ref} className={cx("reveal", seen && "in", className)} style={{ "--d": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** Counts up from 0 to `value` when first visible. */
export function CountUp({ value, duration = 900, suffix = "" }: { value: number; duration?: number; suffix?: string }) {
  const [ref, seen] = useInView<HTMLSpanElement>("0px");
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0));
  useEffect(() => {
    if (!seen) return;
    if (reducedMotion()) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setShown(Math.round(value * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, value, duration]);
  return (
    <span ref={ref} className="tabular">
      {shown.toLocaleString()}
      {suffix}
    </span>
  );
}

/** Animates plain numeric values ("278", "1,204", "46%", 76); anything else is rendered as-is. */
export function AnimatedValue({ value }: { value: ReactNode }) {
  if (typeof value === "number" && Number.isFinite(value)) return <CountUp value={value} />;
  if (typeof value === "string") {
    const m = /^([\d,]+)(%?)$/.exec(value.trim());
    if (m) return <CountUp value={Number(m[1].replace(/,/g, ""))} suffix={m[2]} />;
  }
  return <>{value}</>;
}
