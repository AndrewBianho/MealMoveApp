"use client";

import { useState } from "react";
import { TOUR_STEPS } from "@/lib/tour/steps";
import { TourOverlay } from "./TourOverlay";

const CLICK_STEP = TOUR_STEPS.find((s) => s.advance === "click")!;
const NEXT_STEP = TOUR_STEPS.find((s) => s.advance === "next")!;

// A fake rect so the spotlight has something to trace without a live tour.
const RECT = {
  top: 120, left: 40, width: 320, height: 96,
  right: 360, bottom: 216, x: 40, y: 120,
  toJSON: () => ({}),
} as DOMRect;

/** Styleguide harness: the overlay's three states, without running a tour. */
export function TourOverlayDemo() {
  const [state, setState] = useState<"click" | "next" | "fallback">("click");
  const step = state === "click" ? CLICK_STEP : NEXT_STEP;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {(["click", "next", "fallback"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            aria-pressed={state === s}
            className={
              "rounded-full border px-3 py-1.5 font-mono text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 " +
              (state === s
                ? "border-neutral-900/10 bg-card text-neutral-900 shadow-card"
                : "border-neutral-900/20 text-neutral-700 hover:text-neutral-900")
            }
          >
            {s === "click" ? "Waits for a click" : s === "next" ? "Explains" : "Anchor missing"}
          </button>
        ))}
      </div>
      <p className="font-mono text-[11px] text-neutral-700">
        Renders full-screen — scroll up if the bubble is off view.
      </p>
      <TourOverlay
        step={step}
        rect={state === "fallback" ? null : RECT}
        onNext={() => {}}
        onSkip={() => {}}
      />
    </div>
  );
}
