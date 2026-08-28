"use client";

import { cn } from "@/components/cn";
import { positionOf, type TourStep } from "@/lib/tour/steps";

const PAD = 6; // breathing room between the target and the cutout edge

/**
 * The spotlight, plus the docked card that narrates the step.
 *
 * The two have separate jobs and separate places: the spotlight says *where* and
 * moves every step, the card says *what* and never moves. Splitting them is what
 * lets the card be a fixed dock instead of a tooltip chasing an anchor around.
 *
 * Two visual registers, because the tour has two kinds of step and a viewer
 * needs to know which one they're in: a step that waits for a real click puts a
 * sage ring on the target and says so, with no Next to press. A step that just
 * explains leads with Next.
 *
 * A null rect means the anchor isn't on screen — an empty feed, a listing that
 * expired mid-tour, an unexpected redirect. That state needs no layout of its
 * own: the card is already where it always is, so the tour simply loses its
 * spotlight and keeps talking. Every failure mode collapses into that.
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
  // The anchor isn't on screen: an empty feed, a listing that expired mid-tour,
  // an unexpected redirect, or a step whose control the app is refusing to show.
  //
  // Offering Next here was wrong. It let the viewer walk the rest of the script
  // — narrating a claim they never made, a hold that never started, a buddy on
  // nothing — each step as absent as the last, all the way to the end. The tour
  // has lost the app; pressing on only compounds it. Say so, and offer the exit.
  // The provider keeps hunting for the anchor on a slow retry, so a step that is
  // merely late repairs itself and this state disappears on its own.
  const lost = rect === null;

  const Bubble = (
    <>
      <p className="font-mono text-[11px] text-rescued-200">{counter}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-neutral-50">
        {lost
          ? "This step points at something that isn't on this screen, so the tour can't carry on from here."
          : step.body}
      </p>
      <div className="mt-3 flex items-center gap-3">
        {lost ? (
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full bg-rescued-600 px-3.5 py-1.5 text-[12px] font-semibold text-neutral-50 transition-colors hover:bg-rescued-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
          >
            End tour
          </button>
        ) : waiting ? (
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
        {!lost && (
          <button
            type="button"
            onClick={onSkip}
            className="rounded-sm font-mono text-[11px] text-rescued-200 transition-colors hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
          >
            Skip tour
          </button>
        )}
      </div>
    </>
  );

  // Does the spotlight land where the card sits?
  //
  // The card is pointer-events-auto and paints last, so a click target underneath
  // it is not merely hidden — the card swallows the click and a click step waits
  // forever. When that happens the card moves to the top instead.
  //
  // A zone test, not a measurement of the card. Measuring it and feeding that back
  // into its own placement makes the flip its own input: flipped, it no longer
  // collides, so it flips back, and the two trade places on every resize. The card
  // runs roughly 120–190px tall over a 76px inset, so the bottom third of the
  // viewport is the region it can occupy.
  //
  // An anchor taller than the viewport (the map canvas) is excluded: it collides
  // wherever the card goes, so moving buys nothing and costs the stability that
  // makes a fixed dock worth having.
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const spansViewport = rect !== null && rect.top - PAD < vh / 3;
  const blocked = rect !== null && rect.bottom + PAD > (vh * 2) / 3 && !spansViewport;

  // One dock, every step — top or bottom, and only the collision above moves it.
  // Otherwise the spotlight moves and the narration stays where it was last read.
  //
  // This replaces a card that floated beside the anchor. That version guessed
  // its own height in two places that disagreed (190px to test for room, 176px
  // to place itself), and the bodies it holds run 30 to 148 characters — two to
  // six lines. When the anchor sat near the top of the viewport the card pinned
  // itself over the spotlight, and because it is pointer-events-auto and paints
  // last, it swallowed the click a click step was waiting for. The tour
  // deadlocked. A fixed dock cannot do that.
  //
  // It also reads better in the room this was built for: on a projector, a card
  // that jumps each step makes every viewer re-find the narration before they
  // can read it. Docked, the eye learns one path — spotlight for where, this
  // corner for what.
  const Card = (
    <div
      className={cn(
        "pointer-events-auto fixed z-modal rounded-2xl bg-neutral-900 px-4 py-3 shadow-lift animate-fade-up",
        "inset-x-3 md:inset-x-auto md:right-4 md:w-[22rem]",
        blocked
          ? "top-3 md:top-4"
          // The bottom inset clears the mobile bottom nav (NavBar's bar is fixed,
          // md:hidden, and about 4rem tall). The takeover step spotlights that
          // bar — docking over it would hide the one thing the step asks you to
          // click.
          : "bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-4"
      )}
    >
      {Bubble}
    </div>
  );

  // No anchor on screen. With no spotlight there is nothing to collide with, so
  // the card docks at the bottom and the fallback is just the tour minus its
  // spotlight — no second layout to maintain, and no jolt when a step loses its
  // anchor.
  if (!rect) return Card;

  const top = rect.top - PAD;
  const left = rect.left - PAD;
  const width = rect.width + PAD * 2;
  const height = rect.height + PAD * 2;

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-modal">
        {/* The cutout: a transparent box whose enormous spread shadow dims
            everything around it. 35% — the demo exists to show the app, and a
            heavier scrim fights that, especially on a projector.

            No transition on position. The box-shadow trick means this element
            IS the spotlight, so any transition on top/left animates the hole
            itself: when a step attaches it scrolls the anchor into view, the
            rect changes, and the spotlight spends 300ms sliding to catch up
            while the viewer watches it lag behind the thing it is pointing at.
            Snapping is correct. */}
        <div
          className={cn(
            "absolute rounded-2xl shadow-[0_0_0_9999px_rgb(var(--n-900)/0.35)]",
            waiting && "ring-2 ring-rescued-400"
          )}
          style={{ top, left, width, height }}
        />
        {/* Click blockers. The scrim above is drawn by a box-shadow, and a
            shadow catches nothing — every dimmed pixel stayed clickable, so a
            viewer could wander off mid-tour into a part of the app the tour
            isn't on. These four rects tile the region around the hole and
            swallow the clicks. They don't block scrolling: a wheel over a fixed
            overlay still chains up to the document, which is the point — the
            page stays explorable, it just isn't operable. */}
        <div
          className="pointer-events-auto absolute inset-x-0 top-0"
          style={{ height: Math.max(0, top) }}
        />
        <div
          className="pointer-events-auto absolute inset-x-0 bottom-0"
          style={{ top: top + height }}
        />
        <div
          className="pointer-events-auto absolute left-0"
          style={{ top, height, width: Math.max(0, left) }}
        />
        <div
          className="pointer-events-auto absolute right-0"
          style={{ top, height, left: left + width }}
        />
      </div>
      {Card}
    </>
  );
}
