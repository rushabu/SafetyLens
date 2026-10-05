import { BarChart3, BookOpen, ChevronRight, Cpu, FileText, FlaskConical, Gauge, Home, Menu, Moon, Network, Sun, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { GLOBAL_KEYS } from "../lib/filters";
import { useMeta } from "../lib/queries";
import { useTheme } from "../lib/theme";
import { Wordmark } from "./Brand";
import EngravedLandscape from "./EngravedLandscape";
import { cx } from "./ui";

const NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { to: "/overview", label: "Overview", Icon: Gauge, keep: true },
      { to: "/upload", label: "Upload & Analyse", Icon: Upload, keep: false },
      { to: "/reports", label: "Reports", Icon: FileText, keep: true },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/patterns", label: "Patterns", Icon: Network, keep: true },
      { to: "/evaluation", label: "Evaluation", Icon: BarChart3, keep: false },
    ],
  },
  {
    label: "Reference",
    items: [{ to: "/method", label: "Method & Taxonomy", Icon: BookOpen, keep: false }],
  },
];

const TITLES: [string, string][] = [
  ["/overview", "Overview"],
  ["/upload", "Upload & Analyse"],
  ["/reports/", "Report detail"],
  ["/reports", "Reports"],
  ["/patterns", "Patterns"],
  ["/evaluation", "Evaluation"],
  ["/method", "Method & Taxonomy"],
];

export function EngineBadge() {
  const { data } = useMeta();
  if (!data) return null;
  const def = data.engines.find((e) => e.id === data.default_engine);
  const llm = data.engines.find((e) => e.id === "llm");
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
      <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 font-medium text-ink shadow-[0_1px_2px_rgba(11,26,61,0.04)]" title={def?.description}>
        <span className="relative flex size-2" aria-hidden>
          <span className="absolute inset-0 animate-ping rounded-full bg-non opacity-40 motion-reduce:hidden" />
          <span className="relative size-2 rounded-full bg-non" />
        </span>
        <Cpu className="size-3.5 text-accent" aria-hidden />
        <span className="max-w-[260px] truncate">{def?.label}</span>
        {def?.id === "baseline" && <span className="hidden text-ink-3 2xl:inline">· rule-based, not a trained model</span>}
      </span>
      {llm && !llm.available && <span className="hidden text-ink-3 xl:inline">LLM adapter not configured</span>}
      {llm?.available && llm.external && (
        <span className="hidden rounded-full border border-ins/30 bg-ins-bg px-2.5 py-1 font-medium text-ins md:inline" title={llm.description}>
          External LLM · {String(llm.data_policy).replace("_", " ")}
        </span>
      )}
    </div>
  );
}

export default function Layout() {
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const { data: meta } = useMeta();

  useEffect(() => setOpen(false), [loc.pathname]);

  // Carry global filters between the filter-aware pages.
  const params = new URLSearchParams(loc.search);
  const carried = new URLSearchParams();
  GLOBAL_KEYS.forEach((k) => params.getAll(k).forEach((v) => carried.append(k, v)));
  const carry = carried.toString() ? `?${carried.toString()}` : "";
  const title = TITLES.find(([p]) => loc.pathname.startsWith(p))?.[1] ?? "";

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-[256px] -translate-x-full flex-col overflow-hidden border-r border-line bg-nav text-nav-ink transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open && "translate-x-0 shadow-[var(--shadow-pop)]",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link to="/" aria-label="SafetyLens home">
            <Wordmark />
          </Link>
          <button className="rounded-lg p-1 hover:bg-surface-2 lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation">
            <X className="size-5" />
          </button>
        </div>
        <nav className="mt-3 flex-1 space-y-5 overflow-y-auto px-3" aria-label="Main">
          {NAV_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3/80">{g.label}</div>
              <div className="space-y-0.5">
                {g.items.map(({ to, label, Icon, keep }) => (
                  <NavLink
                    key={to}
                    to={keep ? `${to}${carry}` : to}
                    className={({ isActive }) =>
                      cx(
                        "group flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13.5px] font-medium transition-colors",
                        isActive ? "bg-surface text-ink shadow-[var(--shadow-card)] ring-1 ring-line" : "text-nav-ink hover:bg-surface/70 hover:text-ink",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon className={cx("size-4 transition-colors", isActive ? "text-accent" : "text-ink-3 group-hover:text-ink-2")} aria-hidden />
                        {label}
                        {isActive && <span className="ml-auto size-1.5 rounded-full bg-accent" aria-hidden />}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          <Link to="/" className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13.5px] font-medium text-ink-3 hover:bg-surface/70 hover:text-ink">
            <Home className="size-4" aria-hidden /> Home
          </Link>
        </nav>
        <div className="relative">
          <EngravedLandscape variant="band" className="pointer-events-none absolute inset-x-0 bottom-0 h-32 w-full opacity-30" />
          <div className="relative m-3 rounded-xl border border-line bg-surface/85 px-3.5 py-3 text-[11px] leading-relaxed text-ink-3 backdrop-blur">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-ink-2">
              <FlaskConical className="size-3.5 text-accent" aria-hidden /> Hackathon prototype
            </div>
            <div>
              Rubric {meta?.rubric.version ?? "…"}
            </div>
            <div>Taxonomy {meta?.taxonomy.version ?? "…"}</div>
            <div>Not validated on OIL data.</div>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-ink/30 backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line/70 bg-surface/75 px-4 backdrop-blur-md lg:px-8">
          <button className="rounded-lg p-1 hover:bg-surface-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[13px] sm:flex">
            <Link to="/" className="text-ink-3 hover:text-ink">
              SafetyLens
            </Link>
            {title && (
              <>
                <ChevronRight className="size-3.5 text-ink-3/70" aria-hidden />
                <span className="truncate font-medium text-ink">{title}</span>
              </>
            )}
          </nav>
          <div className="min-w-0 flex-1">
            <EngineBadge />
          </div>
          <span className="hidden h-5 w-px bg-line xl:block" aria-hidden />
          <span className="hidden whitespace-nowrap text-xs text-ink-3 xl:inline">Oil India Limited · PS 26165</span>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-ink-2 transition-colors hover:border-accent/40 hover:text-accent"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </header>
        <main key={loc.pathname} className="page-in mx-auto max-w-[1400px] px-4 py-7 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-[1.9rem] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
