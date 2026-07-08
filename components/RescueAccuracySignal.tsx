"use client";

import { useState } from "react";
import { cn } from "./cn";
import { RESCUE_ACCURACY_OPTIONS, type RescueAccuracy } from "@/lib/accuracy";

// The volunteer's one-tap "rescue accuracy" signal, shown once a delivery is
// complete: was the food there and roughly as described? It's a quiet operations
// signal that helps the chapter spot a restaurant whose pickups keep coming up
// short — not a rating the restaurant is shamed by (kept private). Calm by
// design: a tap, an optional aside, a thank-you. Re-answerable to fix a mistap.

// Per-option accent: "yes" reads as a rescued win, "partly"/"no" stay neutral
// so the control never feels like assigning blame.
const ACCENT: Record<RescueAccuracy, string> = {
  yes: "border-rescued-400 bg-rescued-50 text-rescued-800",
  partly: "border-neutral-400 bg-neutral-100 text-neutral-900",
  no: "border-neutral-400 bg-neutral-100 text-neutral-900",
};

export function RescueAccuracySignal({
  current,
  pending,
  onSubmit,
}: {
  current?: RescueAccuracy;
  pending?: boolean;
  onSubmit: (accuracy: RescueAccuracy, note: string) => void;
}) {
  const [editing, setEditing] = useState(!current);
  const [choice, setChoice] = useState<RescueAccuracy | null>(current ?? null);
  const [note, setNote] = useState("");

  // Recorded and not re-editing: a calm acknowledgement + a way back in.
  if (current && !editing) {
    const label = RESCUE_ACCURACY_OPTIONS.find((o) => o.value === current)?.label;
    return (
      <div className="rounded-2xl border border-neutral-200/60 bg-card p-4">
        <p className="font-mono text-[13px] text-neutral-700">
          Rescue accuracy
        </p>
        <p className="mt-1 text-[16px] text-neutral-800">
          Thanks — you marked this <span className="font-semibold">{label?.toLowerCase()}</span>.
          It helps us keep pickups dependable.
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 font-mono text-[14px] text-clay-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
        >
          Change answer
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-card p-4">
      <p className="text-[16px] font-semibold">How was this pickup?</p>
      <p className="text-[15px] text-neutral-700">
        Was the food there and roughly as described? This stays private — it helps the
        chapter, never a public score.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {RESCUE_ACCURACY_OPTIONS.map((o) => {
          const active = choice === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => setChoice(o.value)}
              className={cn(
                "rounded-full border-2 px-4 py-2 text-[16px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400",
                active
                  ? ACCENT[o.value]
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <label className="mt-3 block">
        <span className="font-mono text-[13px] text-neutral-700">
          Add a note (optional)
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={280}
          placeholder="e.g. half the trays were already gone"
          className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
        />
      </label>

      <button
        type="button"
        disabled={!choice || pending}
        onClick={() => choice && onSubmit(choice, note)}
        className="mt-2 rounded-2xl bg-gradient-to-b from-rescued-400 to-rescued-600 px-5 py-2 text-[16px] font-bold text-white shadow-glow transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {pending ? "Saving…" : "Send signal"}
      </button>
    </div>
  );
}
