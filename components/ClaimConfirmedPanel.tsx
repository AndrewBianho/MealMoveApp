import { ArrowRight } from "./icons";
import { cn } from "./cn";
import { DropOffName } from "./RetrievalHoursDisplay";
import type { RetrievalHours } from "@/lib/hours";

// The acknowledgment beat at the moment a volunteer commits.
//
// Until 2026-09-13 this panel was ClaimHoldPanel, and its lower half was the
// honest face of a 15-minute hold: a live countdown, a draining bar, and a
// warning that the pickup would return to the feed. That hold is gone — a claim
// now stands until it's delivered or released by hand — so the clock went with
// it and what remains is the part that was never about the hold: you have it,
// here's the route, here's the next move.
//
// Deliberately the quiet bookend to RescueCelebration: same journey line, same
// sage, but a panel rather than a modal. Claiming is a start, and the volunteer
// has somewhere to be.

// The check draws itself in on claim — the one "it worked" flourish here.
// stroke-dasharray is a literal 20 (roughly this path's length, and what the
// draw-check keyframe counts the offset down from); it can't be interpolated
// or Tailwind's JIT won't see the class.
function DrawnCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d="M5 13l4 4L19 7"
        className="[stroke-dasharray:20] motion-safe:animate-draw-check"
      />
    </svg>
  );
}

export function ClaimConfirmedPanel({
  source,
  dropOff,
  dropOffHours,
  className,
}: {
  source: string;
  dropOff?: string | null;
  /** Drives the open/closed badge beside the destination. Omit when unknown. */
  dropOffHours?: RetrievalHours;
  className?: string;
}) {
  return (
    <div
      className={cn("animate-fade-up rounded-xl bg-rescued-50 px-4 py-4", className)}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rescued-600 text-white motion-safe:animate-scale-in"
        >
          <DrawnCheck />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold leading-snug text-rescued-800">
            It&apos;s yours
          </p>
          {/* The same source → drop-off line the celebration closes with, so
              the two moments read as bookends on one journey. */}
          {/* Wraps rather than truncating: on a 320px phone one row squeezed
              both ends of the route to about seven characters each ("Sunris… →
              St. M…"), which is the whole message gone. The arrow travels with
              the destination onto the second line; truncation is the last
              resort, for a single name too long for a line on its own. */}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[15px] text-neutral-700">
            <span className="max-w-full truncate">{source}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden className="shrink-0 text-clay-600">
                <ArrowRight />
              </span>
              <DropOffName
                name={
                  <span className="max-w-full truncate">
                    {dropOff ?? "drop-off"}
                  </span>
                }
                hours={dropOffHours}
              />
            </span>
          </p>
        </div>
      </div>

      <div className="mt-3.5 border-t border-rescued-200/60 pt-3">
        <p className="text-[15px] leading-relaxed text-neutral-700">
          Snap the pickup photo when you arrive. That moves it to in transit.
        </p>
      </div>
    </div>
  );
}
