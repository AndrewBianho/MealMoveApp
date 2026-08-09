import { cn } from "./cn";
import { formatEventTime } from "@/lib/time";
import {
  RESCUE_STEPS,
  isTerminal,
  progressOf,
  type RescueStepIndex,
} from "@/lib/rescueProgress";
import type { Listing } from "@/lib/types";

// The rescue lifecycle timeline — times over dots over labels on four equal
// columns, with a progress fill running dot-center to dot-center. Extracted
// from PickupTimelineCard so the listing detail page can show a volunteer the
// same arc while they're standing in the doorway deciding what the camera
// button is for. Both surfaces read the step vocabulary from lib/rescueProgress.

// Full span is 75% of the row (12.5% inset each side), so each completed step
// adds a quarter of the row.
const FILL: Record<number, string> = { 0: "w-0", 1: "w-1/4", 2: "w-2/4", 3: "w-3/4" };

function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="9"
      height="9"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// The just-earned step's check draws itself in one stroke instead of appearing
// already ticked — the mini celebration for advancing a stage. Literal class
// strings so Tailwind's JIT sees them. `both` fill means reduced motion simply
// shows a finished check, so the state is never carried by the animation alone.
function DrawnCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="9"
      height="9"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline
        points="20 6 9 17 4 12"
        className="[stroke-dasharray:20] motion-safe:animate-draw-check"
      />
    </svg>
  );
}

// The two surfaces sit on different grounds and have different widths, so the
// chrome is tuned per placement while the geometry stays identical: `feed` on
// the narrow PickupTimelineCard (tighter padding, labels that step down on a
// phone), `panel` at the top of the listing detail action column.
const VARIANT = {
  feed: {
    shell: "border-neutral-200/60 bg-neutral-50 px-2 pb-2 pt-3.5 sm:px-3.5",
    label: "px-0.5 text-[11px] sm:text-[13px]",
  },
  panel: {
    shell: "border-neutral-200/40 bg-card px-3 pb-3 pt-4 sm:px-5",
    label: "text-[13px]",
  },
} as const;

export function RescueProgress({
  listing,
  variant = "feed",
  celebrateStep = null,
  className,
}: {
  listing: Listing;
  variant?: keyof typeof VARIANT;
  /**
   * Index of a step that was *just* reached — its dot draws its check in rather
   * than rendering already ticked. Set right after a photo advances the rescue;
   * leave null for the resting state.
   */
  celebrateStep?: RescueStepIndex | null;
  className?: string;
}) {
  const skin = VARIANT[variant];
  const { status } = listing;
  const progress = progressOf(listing);
  const terminal = isTerminal(status);
  const delivered = status === "delivered";
  const heldOvernight = status === "taken home";

  const times = [
    listing.postedAt,
    listing.claimedAt,
    listing.pickedUpAt,
    listing.deliveredAt,
  ];

  const deliverByLabel = listing.deliverBy
    ? new Date(listing.deliverBy).toLocaleString([], {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      aria-label={`Pickup progress: ${status}`}
      className={cn("rounded-2xl border", skin.shell, className)}
    >
      <div className="flex">
        {RESCUE_STEPS.map((name, i) => (
          <div
            key={name}
            className={cn(
              "min-h-[12px] flex-1 text-center font-mono text-[10.5px] font-bold tabular-nums",
              i <= progress ? "text-neutral-900" : "text-neutral-700"
            )}
          >
            {i <= progress ? formatEventTime(times[i]) : ""}
          </div>
        ))}
      </div>

      <div className="relative my-2 flex items-center">
        <div
          aria-hidden
          className="absolute inset-x-[12.5%] top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-neutral-200"
        />
        <div
          aria-hidden
          className={cn(
            "absolute left-[12.5%] top-1/2 h-[3px] -translate-y-1/2 rounded-full transition-[width] duration-300",
            terminal ? "bg-neutral-300" : "bg-rescued-600",
            FILL[progress]
          )}
        />
        {RESCUE_STEPS.map((name, i) => {
          const done = i <= progress;
          const active = !terminal && !delivered && i === progress + 1;
          const celebrating = done && i === celebrateStep;
          return (
            <div key={name} className="relative z-[1] flex flex-1 justify-center">
              <span className="relative flex h-4 w-4 items-center justify-center">
                {active && (
                  <span
                    aria-hidden
                    className="absolute -inset-1 rounded-full bg-rescued-400/25 motion-safe:animate-pulse"
                  />
                )}
                <span
                  className={cn(
                    "relative flex h-4 w-4 items-center justify-center rounded-full border-2 text-white",
                    done
                      ? terminal
                        ? "border-neutral-400 bg-neutral-400"
                        : "border-rescued-600 bg-rescued-600"
                      : active
                        ? "border-rescued-400 bg-card"
                        : "border-neutral-200 bg-card"
                  )}
                >
                  {done && (celebrating ? <DrawnCheck /> : <Check />)}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Labels share the four equal columns with the dots above. On a narrow
          phone the columns get tight, so the label steps down a size and keeps a
          hair of side padding — centered on its dot, never touching its
          neighbour. */}
      <div className="flex">
        {RESCUE_STEPS.map((name) => (
          <div
            key={name}
            className={cn(
              "flex-1 text-center font-semibold leading-tight text-neutral-700",
              skin.label
            )}
          >
            {name}
          </div>
        ))}
      </div>

      {heldOvernight && (
        <p className="mt-2 text-center font-mono text-[13px] text-transit-800">
          Held overnight{deliverByLabel ? ` · deliver by ${deliverByLabel}` : ""}
        </p>
      )}
    </div>
  );
}
