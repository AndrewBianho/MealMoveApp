"use client";

import { useMemo, useState } from "react";
import { cn } from "./cn";
import { PickupTimelineCard } from "./PickupTimelineCard";
import { EmptyState } from "./EmptyState";
import type { Listing, ListingStatus } from "@/lib/types";

const STATUS_ORDER: ListingStatus[] = [
  "claimed",
  "in transit",
  "taken home",
  "delivered",
  "expired",
  "failed",
];

// Chip dots keep their stage ramp in both chip states — the label + mono count
// carry the meaning, the hue just echoes it (color-blind-safe).
const DOT: Record<string, string> = {
  all: "bg-neutral-400",
  claimed: "bg-urgent-600",
  "in transit": "bg-transit-600",
  "taken home": "bg-transit-600",
  delivered: "bg-rescued-600",
  expired: "bg-neutral-400",
  failed: "bg-failed-600",
};

/**
 * "My pickups" — one list of lifecycle-timeline cards, scoped by a status
 * chip row (All + only the stages actually present). From the pickups-timeline
 * handoff: chips follow the feed's pill spec (fully round, ink fill when
 * active, status dot + mono count), cards tell each pickup's story from post
 * to delivery.
 */
export function PickupSections({
  active,
  past,
  hadInvites,
}: {
  active: Listing[];
  past: Listing[];
  /** Whether the invites section above holds the page's first photo (LCP). */
  hadInvites: boolean;
}) {
  const [filter, setFilter] = useState<string>("all");

  const all = useMemo(() => {
    const merged = [...active, ...past];
    return merged.sort(
      (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
    );
  }, [active, past]);

  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of all) counts.set(l.status, (counts.get(l.status) ?? 0) + 1);
    return [
      { value: "all", label: "all", count: all.length },
      ...STATUS_ORDER.filter((s) => counts.has(s)).map((s) => ({
        value: s,
        label: s,
        count: counts.get(s)!,
      })),
    ];
  }, [all]);

  if (all.length === 0) {
    return (
      <section className="max-w-[780px]">
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="M3.3 7 12 12l8.7-5" />
              <path d="M12 22V12" />
            </svg>
          }
          title="Nothing in flight right now"
          hint="Claim a pickup from the feed and it'll show up here."
        />
      </section>
    );
  }

  const shown = filter === "all" ? all : all.filter((l) => l.status === filter);

  return (
    <section className="max-w-[780px]">
      {chips.length > 2 && (
        <div
          role="group"
          aria-label="Filter your pickups by stage"
          className="mb-6 flex flex-wrap items-center gap-1.5"
        >
          {chips.map((c) => {
            const isActive = filter === c.value;
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => setFilter(c.value)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400",
                  isActive
                    ? "bg-neutral-900 text-neutral-50"
                    : "border border-neutral-200 bg-card text-neutral-700 hover:shadow-card"
                )}
              >
                <span
                  aria-hidden
                  className={cn("h-[7px] w-[7px] rounded-full", DOT[c.value])}
                />
                {c.label}
                <span
                  className={cn(
                    "font-mono text-[11px]",
                    isActive ? "text-neutral-50/60" : "text-neutral-500"
                  )}
                >
                  {c.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {shown.length > 0 ? (
        <div className="flex flex-col gap-[18px]">
          {shown.map((l, i) => (
            <PickupTimelineCard
              key={l.id}
              listing={l}
              // First photo here is the LCP unless the invites grid beat it.
              priorityImage={i === 0 && !hadInvites}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-3xl border border-neutral-200/70 bg-card px-5 py-14 text-center text-[15px] font-medium text-neutral-500">
          No pickups in this stage right now.
        </p>
      )}
    </section>
  );
}
