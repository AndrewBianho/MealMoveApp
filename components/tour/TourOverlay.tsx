"use client";

import { cn } from "@/components/cn";
import { positionOf, type TourStep } from "@/lib/tour/steps";

const PAD = 6; // breathing room between the target and the cutout edge

/**
 * The spotlight itself, plus the bubble that explains the step.
 *
 * Two visual registers, because the tour has two kinds of step and a viewer
 * needs to know which one they're in: a step that waits for a real click puts a
 * sage ring on the target and says so, with no Next to press. A step that just
 * explains leads with Next.
 *
 * A null rect means the anchor isn't on screen — an empty feed, a listing that
 * expired mid-tour, an unexpected redirect. Rather than positioning a bubble
 * over nothing, the same copy renders in a docked card. Every failure mode
 * collapses into this one path.
 */
export function TourOverlay({
  step,
  rect,
  onNext,
  onSkip,
}: {
  step: TourStep;
  rect: DOMRect | null;
  onNext: () => void;
  onSkip: () => void;
}) {
  const pos = positionOf(step);
  const counter = `Chapter ${pos.chapter} of ${pos.chapterOf} · Step ${pos.step} of ${pos.stepOf}`;
  const waiting = step.advance === "click";

  // Pre-render safety: this component is a client component, but Next still
  // renders it on the server, where there is no window. The fallbacks only
  // affect that one pre-hydration frame.
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;

  const Bubble = (
    <>
      <p className="font-mono text-[11px] text-rescued-200">{counter}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-neutral-50">{step.body}</p>
      <div className="mt-3 flex items-center gap-3">
        {waiting ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-rescued-200">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-rescued-400 motion-safe:animate-pulse"
            />
            Waiting for your click
          </span>
        ) : (
          <button
            type="button"
            onClick={onNext}
            className="rounded-full bg-rescued-600 px-3.5 py-1.5 text-[12px] font-semibold text-neutral-50 transition-colors hover:bg-rescued-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
          >
            Next
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onSkip}
          className="rounded-sm font-mono text-[11px] text-rescued-200 transition-colors hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
        >
          Skip tour
        </button>
      </div>
    </>
  );

  // No anchor on screen — dock the same words to the bottom of the viewport.
  if (!rect) {
    return (
      <div className="pointer-events-none fixed inset-0 z-modal">
        <div className="pointer-events-auto absolute inset-x-3 bottom-3 mx-auto max-w-md rounded-2xl bg-neutral-900 px-4 py-3 shadow-lift animate-fade-up sm:inset-x-auto sm:right-4 sm:w-[22rem]">
          {Bubble}
        </div>
      </div>
    );
  }

  const top = rect.top - PAD;
  const left = rect.left - PAD;
  const width = rect.width + PAD * 2;
  const height = rect.height + PAD * 2;
  // Below the target when there's room, otherwise above it.
  const below = top + height + 190 < vh;

  return (
    <div className="pointer-events-none fixed inset-0 z-modal">
      {/* The cutout: a transparent box whose enormous spread shadow dims
          everything around it. 35% — the demo exists to show the app, and a
          heavier scrim fights that, especially on a projector. */}
      <div
        className={cn(
          "absolute rounded-2xl shadow-[0_0_0_9999px_rgba(33,29,25,0.35)] transition-all duration-300",
          waiting && "ring-2 ring-rescued-400"
        )}
        style={{ top, left, width, height }}
      />
      <div
        className="pointer-events-auto absolute w-[min(92vw,20rem)] rounded-2xl bg-neutral-900 px-4 py-3 shadow-lift animate-fade-up"
        style={{
          left: Math.min(Math.max(8, left), vw - 332),
          ...(below ? { top: top + height + 12 } : { top: Math.max(8, top - 176) }),
        }}
      >
        {Bubble}
      </div>
    </div>
  );
}
