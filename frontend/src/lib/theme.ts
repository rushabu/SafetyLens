import { useEffect, useRef, useState } from "react";

export type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || "light");
  const first = useRef(true);
  useEffect(() => {
    const root = document.documentElement;
    // Cross-fade colours when the user toggles (not on first render).
    let timer: number | undefined;
    if (!first.current && root.dataset.theme !== theme) {
      root.classList.add("theme-anim");
      timer = window.setTimeout(() => root.classList.remove("theme-anim"), 420);
    }
    first.current = false;
    root.dataset.theme = theme;
    try {
      localStorage.setItem("safetylens-theme", theme);
    } catch {
      /* storage unavailable */
    }
    return () => {
      if (timer) window.clearTimeout(timer);
      root.classList.remove("theme-anim");
    };
  }, [theme]);
  return [theme, setTheme] as const;
}
