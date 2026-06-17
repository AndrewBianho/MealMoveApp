"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDataMode } from "@/app/actions";
import { cn } from "./cn";

type Mode = "real" | "demo";

const OPTIONS: { value: Mode; label: string }[] = [
  { value: "real", label: "Real" },
  { value: "demo", label: "Demo" },
];

export function DataModeToggle({ current }: { current: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(current);
  const [pending, startTransition] = useTransition();

  function choose(next: Mode) {
    if (next === mode || pending) return;
    setMode(next); // optimistic
    startTransition(async () => {
      const res = await setDataMode(next);
      if (!res.ok) {
        setMode(current); // roll back on failure
        return;
      }
      // Server components read the mode on the next render — pull fresh data.
      router.refresh();
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Data"
      className={cn(
        "inline-flex rounded-full border border-neutral-200 p-1",
        pending && "opacity-70"
      )}
    >
      {OPTIONS.map((o) => {
        const active = mode === o.value;
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
                : "text-neutral-700 hover:text-neutral-900"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
