"use client";

import { useMemo, useState, useTransition } from "react";
import { cn } from "./cn";
import { ListingCard } from "./ListingCard";
import { EmptyState } from "./EmptyState";
import { Toast, useToast } from "./Toast";
import { useGeolocation } from "./useGeolocation";
import { claimListing } from "@/app/actions";
import { haversineMiles, formatMiles } from "@/lib/distance";
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

type Filter = "all" | "open" | "coming up" | "claimed" | "in transit" | "delivered";

const FILTERS: Filter[] = ["all", "open", "coming up", "claimed", "in transit", "delivered"];

// Each filter wears the status's semantic hue as a dot, so the filter row speaks
// the same color language as the cards/map (sage = open & delivered/rescued,
// honey = claimed, plum = in transit). "all" is the neutral aggregate; "coming
// up" wears clay — the same accent the cards use for a scheduled listing.
const FILTER_DOT: Record<Filter, string> = {
  all: "bg-neutral-400",
  open: "bg-rescued-600",
  "coming up": "bg-clay-600",
  claimed: "bg-urgent-600",
  "in transit": "bg-transit-600",
  delivered: "bg-rescued-600",
};

// Short, sentence-case labels for the pill row. The dropdown's fuller phrasing
// isn't needed when the dot + count already carry context.
const PILL_LABEL: Record<Filter, string> = {
  all: "all",
  open: "open",
  "coming up": "coming up",
  claimed: "claimed",
  "in transit": "in transit",
  delivered: "delivered",
};

// Filter pills (nav-pill spec: fully round, ink fill when active, rescued focus
// ring). Each pairs the status dot with a mono count, so the row reads the same
// color language as the cards.
function FilterPills({
  filter,
  counts,
  onChange,
}: {
  filter: Filter;
  counts: Record<string, number>;
  onChange: (f: Filter) => void;
}) {
  return (
    <div role="group" aria-label="Filter listings" className="flex flex-wrap gap-2">
      {FILTERS.map((f) => {
        const active = f === filter;
        return (
          <button
            key={f}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(f)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50",
              active
                ? "border-neutral-900 bg-neutral-900 text-neutral-50"
                : "border-neutral-200 bg-card text-neutral-700 hover:border-neutral-300 hover:shadow-card"
            )}
          >
            <span
              className={cn("h-[7px] w-[7px] rounded-full", FILTER_DOT[f])}
              aria-hidden="true"
            />
            {PILL_LABEL[f]}
            <span
              className={cn(
                "font-mono text-[11px] tabular-nums",
                active ? "text-neutral-400" : "text-neutral-500"
              )}
            >
              {counts[f] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function isSpent(status: ListingStatus): boolean {
  return ["delivered", "expired", "failed"].includes(status);
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3.5 flex items-center gap-2">
      <h2 className="text-[15px] font-semibold text-neutral-800">{title}</h2>
      <span className="font-mono text-xs text-neutral-500">{count}</span>
    </div>
  );
}

// Single-column stack — wide horizontal cards, one per row, in a calm rhythm.
function ListingStack({
  listings,
  onClaim,
}: {
  listings: Listing[];
  onClaim?: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-[18px]">
      {listings.map((l, i) => (
        <ListingCard
          key={l.id}
          listing={l}
          onClaim={onClaim}
          className={STAGGER[Math.min(i, STAGGER.length - 1)]}
        />
      ))}
    </div>
  );
}

export function ListingFeed({
  listings,
  canClaim = true,
}: {
  listings: Listing[];
  /** Org admins oversee but don't carry pickups — hide the claim affordance. */
  canClaim?: boolean;
}) {
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
  const onClaim = canClaim ? handleClaim : undefined;

  // Real "how far" once the browser shares a location: straight-line miles from
  // the volunteer to each listing's restaurant. Until then (or if denied) the
  // listings keep their "—" placeholder, so the feed never blocks on geo.
  const here = useGeolocation();
  const located = useMemo(() => {
    if (!here) return listings;
    return listings.map((l) =>
      l.lat != null && l.lng != null
        ? { ...l, distance: formatMiles(haversineMiles(here, { lat: l.lat, lng: l.lng })) }
        : l
    );
  }, [listings, here]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of listings) c[l.status] = (c[l.status] ?? 0) + 1;
    // "open" and "all" mean claimable now — future/scheduled listings live under
    // their own "coming up" pill, so peel them out of both.
    const scheduled = listings.filter((l) => l.status === "open" && l.scheduled).length;
    if (c.open) c.open = Math.max(0, c.open - scheduled);
    c["coming up"] = scheduled;
    c.all = listings.length - scheduled;
    return c;
  }, [listings]);

  const shown = useMemo(() => {
    let list: Listing[];
    if (filter === "all") {
      list = located.filter((l) => !(l.status === "open" && l.scheduled));
    } else if (filter === "coming up") {
      list = located.filter((l) => l.status === "open" && l.scheduled);
    } else if (filter === "open") {
      list = located.filter((l) => l.status === "open" && !l.scheduled);
    } else {
      list = located.filter((l) => l.status === filter);
    }
    return [...list].sort((a, b) => {
      if (isSpent(a.status) !== isSpent(b.status)) {
        return Number(isSpent(a.status)) - Number(isSpent(b.status));
      }
      return a.minutesLeft - b.minutesLeft;
    });
  }, [located, filter]);

  // Split what's shown into three bands so the eye goes to claimable food first.
  const claimable = shown.filter((l) => l.status === "open" && !l.scheduled);
  const comingUp = shown
    .filter((l) => l.status === "open" && l.scheduled)
    .sort((a, b) => (a.availableAt ?? 0) - (b.availableAt ?? 0));
  const unclaimable = shown.filter((l) => l.status !== "open");

  return (
    <div className={cn(isPending && "opacity-70 transition-opacity")}>
      <div className="mb-6">
        <FilterPills filter={filter} counts={counts} onChange={setFilter} />
      </div>

      {shown.length > 0 ? (
        <div className="space-y-9">
          {claimable.length > 0 && (
            <section>
              <SectionHeader title="Available to claim" count={claimable.length} />
              <ListingStack listings={claimable} onClaim={onClaim} />
            </section>
          )}
          {comingUp.length > 0 && (
            <section>
              <SectionHeader title="Coming up" count={comingUp.length} />
              <p className="-mt-2 mb-3.5 text-sm text-neutral-600">
                Scheduled pickups you can plan around — each opens to claim at its
                listed time.
              </p>
              <ListingStack listings={comingUp} />
            </section>
          )}
          {unclaimable.length > 0 && (
            <section>
              <SectionHeader title="Claimed & closed" count={unclaimable.length} />
              <ListingStack listings={unclaimable} />
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
