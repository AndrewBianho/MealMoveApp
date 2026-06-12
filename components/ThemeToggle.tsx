"use client";

import { useEffect, useState } from "react";
import { cn } from "./cn";

type Mode = "light" | "dark" | "system";

const OPTIONS: { value: Mode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const KEY = "mm.theme";

function systemPrefersDark() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function apply(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  // Mounted guard so the active pill matches the real (client) value and
  // doesn't mismatch the server-rendered default.
  const [mode, setMode] = useState<Mode>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Mode | null) ?? "light";
    setMode(stored);
    setMounted(true);
  }, []);

  // Keep "system" live to OS changes while it's selected.
  useEffect(() => {
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [mode]);

  function choose(next: Mode) {
    setMode(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    apply(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex rounded-full border border-neutral-200 p-1"
    >
      {OPTIONS.map((o) => {
        const active = mounted && mode === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(o.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
              active
                ? "bg-neutral-900 text-neutral-50"
                : "text-neutral-600 hover:text-neutral-900"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
