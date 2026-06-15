"use client";

import { useMemo, useState, useTransition } from "react";
import { cn } from "./cn";
import { ListingCard } from "./ListingCard";
import { EmptyState } from "./EmptyState";
import { Toast, useToast } from "./Toast";
import { claimListing } from "@/app/actions";
import type { Listing, ListingStatus } from "@/lib/types";

// Per-card entrance delay (arbitrary animation-delay utilities), capped so a
// long list doesn't drift in forever.
const STAGGER = [
  "",
  "[animation-delay:60ms]",
  "[animation-delay:120ms]",
  "[animation-delay:180ms]",
  "[animation-delay:240ms]",
  "[animation-delay:300ms]",
  "[animation-delay:360ms]",
  "[animation-delay:420ms]",
];

type Filter = "all" | "open" | "claimed" | "in transit" | "delivered";

const FILTERS: Filter[] = ["all", "open", "claimed", "in transit", "delivered"];

// Each filter wears the status's semantic hue as a dot, so the filter row speaks
// the same color language as the cards/map (sage = open & delivered/rescued,
// honey = claimed, plum = in transit). "all" is the neutral aggregate.
const FILTER_DOT: Record<Filter, string> = {
  all: "bg-neutral-400",
  open: "bg-rescued-600",
  claimed: "bg-urgent-600",
  "in transit": "bg-transit-600",
  delivered: "bg-rescued-600",
};

function isSpent(status: ListingStatus): boolean {
  return ["delivered", "expired", "failed"].includes(status);
}

// "Calm by default; urgent only when it counts" — an open listing closing in
// under 10 minutes is featured (spans two columns) so it dominates the grid.
// When nothing is that urgent, the grid stays uniform.
function isClosingSoon(l: Listing): boolean {
  return l.status === "open" && l.minutesLeft < 10;
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="text-base font-semibold text-neutral-800">{title}</h2>
      <span className="font-mono text-xs text-neutral-700">{count}</span>
    </div>
  );
}

function ListingGrid({
  listings,
  feature,
  onClaim,
}: {
  listings: Listing[];
  feature?: boolean;
  onClaim?: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {listings.map((l, i) => (
        <div
          key={l.id}
          className={cn(
            feature && isClosingSoon(l) && "md:col-span-2 lg:col-span-2"
          )}
        >
          <ListingCard
            listing={l}
            onClaim={onClaim}
            className={STAGGER[Math.min(i, STAGGER.length - 1)]}
          />
        </div>
      ))}
    </div>
  );
}

export function ListingFeed({ listings }: { listings: Listing[] }) {
  const [filter, setFilter] = useState<Filter>("open");
  const { message, show } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleClaim(id: string) {
    const target = listings.find((l) => l.id === id);
    startTransition(async () => {
      await claimListing(id);
      show(`Claimed — head to ${target?.source ?? "pickup"}.`);
    });
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: listings.length };
    for (const l of listings) c[l.status] = (c[l.status] ?? 0) + 1;
    // "open" on the pill means claimable now — future/scheduled listings are
    // counted under "Coming up", not here.
    const scheduled = listings.filter((l) => l.status === "open" && l.scheduled).length;
    if (c.open) c.open = Math.max(0, c.open - scheduled);
    return c;
  }, [listings]);

  const shown = useMemo(() => {
    const list =
      filter === "all" ? listings : listings.filter((l) => l.status === filter);
    return [...list].sort((a, b) => {
      if (isSpent(a.status) !== isSpent(b.status)) {
        return Number(isSpent(a.status)) - Number(isSpent(b.status));
      }
      return a.minutesLeft - b.minutesLeft;
    });
  }, [listings, filter]);

  // Split what's shown into three bands so the eye goes to claimable food
  // first: claimable now (open + live), upcoming (open but scheduled for a
  // future time, sorted soonest-first), and everything else (claimed / in
  // transit / closed).
  const claimable = shown.filter((l) => l.status === "open" && !l.scheduled);
  const comingUp = shown
    .filter((l) => l.status === "open" && l.scheduled)
    .sort((a, b) => (a.availableAt ?? 0) - (b.availableAt ?? 0));
  const unclaimable = shown.filter((l) => l.status !== "open");

  return (
    <div className={cn(isPending && "opacity-70 transition-opacity")}>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50",
                active
                  ? "border-neutral-900 bg-neutral-900 font-medium text-neutral-50"
                  : "border-neutral-200/60 text-neutral-700 hover:bg-card hover:shadow-card"
              )}
            >
              <span
                className={cn("h-2 w-2 rounded-full", FILTER_DOT[f])}
                aria-hidden="true"
              />
              {f}
              <span
                className={cn(
                  "font-mono text-xs tabular-nums",
                  active ? "text-neutral-300" : "text-neutral-700"
                )}
              >
                {counts[f] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {shown.length > 0 ? (
        <div className="space-y-8">
          {claimable.length > 0 && (
            <section>
              <SectionHeader title="Available to claim" count={claimable.length} />
              <ListingGrid listings={claimable} feature onClaim={handleClaim} />
            </section>
          )}
          {comingUp.length > 0 && (
            <section>
              <SectionHeader title="Coming up" count={comingUp.length} />
              <p className="-mt-2 mb-3 text-sm text-neutral-700">
                Scheduled pickups you can plan around — each opens to claim at its
                listed time.
              </p>
              <ListingGrid listings={comingUp} />
            </section>
          )}
          {unclaimable.length > 0 && (
            <section>
              <SectionHeader title="Claimed & closed" count={unclaimable.length} />
              <ListingGrid listings={unclaimable} />
            </section>
          )}
        </div>
      ) : (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 20c0-4 0-7 5-7" />
              <path d="M12 13c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6Z" />
              <path d="M12 13c0-3-2-5.5-5-5.5C7 10.5 9 13 12 13Z" />
            </svg>
          }
          title={`No ${filter === "all" ? "" : `${filter} `}listings right now`}
          hint="Check back soon — new rescues post throughout the evening."
        />
      )}

      <Toast message={message} />
    </div>
  );
}
