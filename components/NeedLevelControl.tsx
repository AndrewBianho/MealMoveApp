"use client";

import { useState, useTransition } from "react";
import { Toast, useToast } from "./Toast";
import { updateNeedLevel } from "@/app/actions";
import type { NeedLevel } from "@/lib/types";

// Lets a drop-off (or an org admin) set how much food this location wants right
// now — a standing, manual signal shown to volunteers choosing a drop-off. A
// calm segmented control, not an urgency cue: the words carry the meaning
// (color-blind-safe), the active option takes the ink fill.
const OPTIONS: { value: NeedLevel; label: string; hint: string }[] = [
  { value: "low", label: "Low", hint: "Plenty for now" },
  { value: "steady", label: "Steady", hint: "Keep it coming" },
  { value: "high", label: "High", hint: "Extra welcome" },
];

export function NeedLevelControl({
  dropOffId,
  initial,
}: {
  dropOffId: string;
  initial: NeedLevel;
}) {
  const [value, setValue] = useState<NeedLevel>(initial);
  const [isPending, startTransition] = useTransition();
  const { message, show } = useToast();

  function choose(next: NeedLevel) {
    if (next === value || isPending) return;
    const prev = value;
    setValue(next); // optimistic
    startTransition(async () => {
      const res = await updateNeedLevel(dropOffId, next);
      if (res.ok) {
        show("Need for food updated.");
      } else {
        setValue(prev); // revert
        show(res.error);
      }
    });
  }

  return (
    <div className="mt-3">
      <p className="mb-1.5 font-mono text-[11px] text-neutral-700">Need for food</p>
      <div
        role="radiogroup"
        aria-label="Need for food"
        className="inline-flex rounded-full bg-neutral-100 p-0.5"
      >
        {OPTIONS.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={o.hint}
              disabled={isPending}
              onClick={() => choose(o.value)}
              className={
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 disabled:cursor-not-allowed " +
                (active
                  ? "bg-neutral-900 text-neutral-50"
                  : "text-neutral-700 hover:bg-card")
              }
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <Toast message={message} />
    </div>
  );
}
