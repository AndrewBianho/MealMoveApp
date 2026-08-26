"use client";

import { useEffect, useState } from "react";
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
  const [state, setState] = useState<"off" | "click" | "next" | "fallback">("off");
  const step = state === "click" ? CLICK_STEP : NEXT_STEP;

  // The overlay's position is measured from the live viewport, so it renders
  // different style values on the server than on the client. Rendering it only
  // after mount keeps that divergence out of hydration — the same reason
  // TourProvider and WelcomeIntro both gate on a mounted flag.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {(["off", "click", "next", "fallback"] as const).map((s) => (
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
            {s === "off" ? "Hidden" : s === "click" ? "Waits for a click" : s === "next" ? "Explains" : "Anchor missing"}
          </button>
        ))}
      </div>
      <p className="font-mono text-[11px] text-neutral-700">
        Renders full-screen, with the card docked bottom-right. The dimmed area
        swallows clicks, so use the card to dismiss it.
      </p>
      {mounted && state !== "off" && (
        <TourOverlay
          step={step}
          rect={state === "fallback" ? null : RECT}
          // Both dismiss. In a real tour these advance and abort, but here the
          // bubble is the only live control on the page: the overlay's blocker
          // rects cover the toggles above, so a no-op handler would strand the
          // styleguide with no way back to "off".
          onNext={() => setState("off")}
          onSkip={() => setState("off")}
        />
      )}
    </div>
  );
}
