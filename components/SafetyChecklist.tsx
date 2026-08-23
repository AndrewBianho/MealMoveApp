"use client";

import { useState } from "react";
import { cn } from "./cn";
import { X } from "./icons";
import { SAFETY_QUESTIONS, type SafetyAnswers } from "@/lib/safety";

// A short, dismissible food-safety checklist shown at the pickup-proof step.
// It's a gentle prompt, never a gate — the volunteer can tick what applies or
// dismiss it, and whatever's ticked is recorded on the pickup. Calm by design:
// no red, no shaming, just a nudge to keep the food safe.

export function SafetyChecklist({
  answers,
  onChange,
}: {
  answers: SafetyAnswers;
  onChange: (next: SafetyAnswers) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  function toggle(key: string) {
    onChange({ ...answers, [key]: !answers[key] });
  }

  const confirmed = SAFETY_QUESTIONS.filter((q) => answers[q.key]).length;

  return (
    <div data-tour="safety-checklist" className="mb-3 animate-fade-in rounded-xl border border-neutral-200/60 bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[16px] font-semibold">
            Quick food-safety check
            <span className="ml-2 font-mono text-[13px] font-normal text-neutral-700 tabular-nums">
              {confirmed}/{SAFETY_QUESTIONS.length} confirmed
            </span>
          </p>
          <p className="text-[15px] text-neutral-700">
            Tick what applies — it travels with the pickup.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss safety checklist"
          className="rounded-full p-1 text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
        >
          <X />
        </button>
      </div>

      <ul className="space-y-1.5">
        {SAFETY_QUESTIONS.map((q) => {
          const checked = !!answers[q.key];
          return (
            <li key={q.key}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[16px] transition-colors",
                  checked ? "bg-rescued-50 text-rescued-800" : "hover:bg-neutral-100"
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(q.key)}
                  className="h-4 w-4 shrink-0 rounded border-neutral-300 text-rescued-600 focus-visible:ring-2 focus-visible:ring-rescued-400"
                />
                {q.label}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
