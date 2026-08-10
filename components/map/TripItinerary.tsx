"use client";

import type { ReactNode } from "react";
import { cn } from "@/components/cn";
import { DropOffName } from "@/components/RetrievalHoursDisplay";
import type { RetrievalHours } from "@/lib/hours";
import type { SlotName, Stop, TripPlan } from "@/lib/tripPlan";

export interface SlotSuggestion {
  id: string;
  name: string;
  minutes?: number;
  miles: number;
  recommended: boolean;
  /** Drop-off suggestions only — restaurants have no hours on file. */
  retrievalHours?: RetrievalHours;
}

// `start` is structurally non-null, so it is rendered outside this list — it
// has no empty state to describe.
const OPTIONAL_ROWS: {
  slot: "pickup" | "dropOff" | "end";
  label: string;
  prompt: string;
}[] = [
  { slot: "pickup", label: "Pickup", prompt: "Choose a pickup — tap a pin" },
  { slot: "dropOff", label: "Drop-off", prompt: "Choose a drop-off — tap a pin" },
  { slot: "end", label: "End", prompt: "Add a final destination (optional)" },
];

/** One node on the trip: connector, dot, label, and either a stop or a prompt. */
function Row({
  label,
  stop,
  prompt,
  last,
  onClear,
  children,
}: {
  label: string;
  stop: Stop | null;
  prompt?: string;
  last?: boolean;
  onClear?: () => void;
  children?: ReactNode;
}) {
  return (
    <li className="relative pl-6">
      {!last && (
        <span
          aria-hidden
          className="absolute bottom-0 left-[5px] top-4 w-px bg-neutral-900/15"
        />
      )}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-2.5 h-[11px] w-[11px] rounded-full border-2",
          stop ? "border-route bg-route" : "border-neutral-900/25 bg-card",
        )}
      />
      <div className="pb-3">
        <div className="font-mono text-[11px] text-neutral-700">{label}</div>
        {stop ? (
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">
              {stop.label}
            </span>
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                aria-label={`Remove ${label.toLowerCase()}`}
                className="-my-1 shrink-0 rounded-full p-1 text-neutral-700 transition-colors hover:bg-neutral-900/5 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-neutral-700">{prompt}</p>
        )}
        {children}
      </div>
    </li>
  );
}

/**
 * The trip as a sequence of rows joined by a connector line — the same visual
 * language PickupTimelineCard already uses, so an assembled trip doesn't read
 * as a new idiom.
 *
 * The ranked suggestions that used to be the route-picker list now hang off
 * whichever slot is still empty, which is what preserves the "here are your
 * nearest drop-offs" discovery the old panel gave.
 */
export function TripItinerary({
  plan,
  suggestions,
  onPick,
  onClearSlot,
  onClearTrip,
}: {
  plan: TripPlan;
  suggestions: { slot: "pickup" | "dropOff"; items: SlotSuggestion[] } | null;
  onPick: (slot: "pickup" | "dropOff", id: string) => void;
  onClearSlot: (slot: SlotName) => void;
  onClearTrip: () => void;
}) {
  const hasAny = plan.pickup || plan.dropOff || plan.end;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] text-neutral-700">Your trip</h2>
        {hasAny && (
          <button
            type="button"
            onClick={onClearTrip}
            className="rounded-sm font-mono text-[11px] text-clay-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
          >
            Clear trip
          </button>
        )}
      </div>

      <ol className="mt-2">
        <Row label="Start" stop={plan.start} />

        {OPTIONAL_ROWS.map((row, i) => {
          const stop = plan[row.slot];
          // Narrowed to a value (not a boolean) so `sug.items` typechecks below.
          const sug =
            !stop && suggestions && suggestions.slot === row.slot
              ? suggestions
              : null;

          return (
            <Row
              key={row.slot}
              label={row.label}
              stop={stop}
              prompt={row.prompt}
              last={i === OPTIONAL_ROWS.length - 1}
              onClear={stop ? () => onClearSlot(row.slot) : undefined}
            >
              {sug && sug.items.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {sug.items.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => onPick(sug.slot, s.id)}
                        className="flex w-full items-center gap-3 rounded-xl border border-neutral-900/10 px-3 py-2 text-left transition-colors hover:border-neutral-900/25 hover:bg-neutral-900/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-sm font-medium text-neutral-900">
                            <DropOffName
                              name={<span className="truncate">{s.name}</span>}
                              hours={s.retrievalHours}
                            />
                          </span>
                          {s.recommended && (
                            <span className="mt-1 inline-flex w-fit items-center rounded-full bg-clay-50 px-1.5 py-0.5 font-mono text-[9px] text-clay-800">
                              Fastest
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-right">
                          {s.minutes != null && (
                            <span className="block font-mono text-sm font-bold tabular-nums text-neutral-900">
                              {s.minutes} min
                            </span>
                          )}
                          <span className="block font-mono text-[11px] tabular-nums text-neutral-700">
                            {s.miles.toFixed(1)} mi
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Row>
          );
        })}
      </ol>
    </div>
  );
}
