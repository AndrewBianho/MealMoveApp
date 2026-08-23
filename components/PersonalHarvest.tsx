import { CountUp } from "./CountUp";
import type { VolunteerImpact } from "@/lib/types";

// A volunteer's own harvest, as one composed statement instead of a row of
// identical metric cards.
//
// The three-card version gave meals, lbs and rescue-count equal billing, which
// is the hero-metric dashboard template: it reads as analytics, on the one
// screen that should feel like a harvest. They aren't peers. "Meals rescued" is
// the story a volunteer tells themselves; weight and count are the footnotes
// that make it credible.
//
// This is also the one surface in the app that commits to colour rather than
// staying restrained — a drenched sage panel, the deepest stop of the "rescued"
// ramp, so the payoff screen is the memorable one. Sage 800 rather than 600
// because cream on 600 lands at 4.10:1 and misses AA; on 800 it's 9.26:1.

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[15px] font-semibold text-neutral-50 tabular-nums">
        {value}
      </span>
      <span className="font-mono text-[13px] text-rescued-200">{label}</span>
    </div>
  );
}

export function PersonalHarvest({ impact }: { impact: VolunteerImpact }) {
  const started = impact.pickupsCompleted > 0;

  return (
    <div data-tour="personal-harvest" className="relative overflow-hidden rounded-3xl bg-rescued-800 px-6 py-7 shadow-card sm:px-8 sm:py-9">
      {/* A soft warm bloom in the corner, so the panel has depth rather than
          reading as a flat block of colour. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-rescued-600 opacity-40 blur-3xl"
      />

      <div className="relative">
        <p className="font-mono text-[13px] text-rescued-200">
          Your harvest so far
        </p>

        {started ? (
          // Hero left, footnotes right, divided by a hairline — so the panel
          // fills its width by composition rather than stretching one number
          // across a wide empty block. Stacks under `sm`.
          <div className="mt-3 flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
            <p className="sm:flex-1">
              <CountUp
                value={String(impact.mealsRescued)}
                className="block font-display text-6xl font-semibold leading-none text-neutral-50 sm:text-7xl"
              />
              <span className="mt-2 block text-[16px] text-rescued-100">
                meals rescued
              </span>
            </p>

            <div className="space-y-2 border-t border-rescued-600/70 pt-4 sm:border-l sm:border-t-0 sm:pl-10 sm:pt-0">
              <Fact value={String(impact.lbsSaved)} label="lbs saved" />
              <Fact
                value={String(impact.pickupsCompleted)}
                label={impact.pickupsCompleted === 1 ? "rescue" : "rescues"}
              />
              <Fact
                value={String(impact.restaurantsHelped)}
                label={
                  impact.restaurantsHelped === 1 ? "restaurant" : "restaurants"
                }
              />
            </div>
          </div>
        ) : (
          // A first-timer shouldn't meet a drenched panel reading "0". Lead with
          // the invitation instead of the scoreboard.
          <>
            <p className="mt-3 font-display text-4xl font-semibold leading-tight text-neutral-50">
              Ready when you are
            </p>
            <p className="mt-2 max-w-[46ch] text-[16px] leading-relaxed text-rescued-100">
              Claim a pickup and the first number lands here. Every meal you move
              is one that was headed for the bin.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
