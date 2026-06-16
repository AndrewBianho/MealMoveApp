"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
// up" wears clay — the same accent the cards use for a scheduled "available
// <when>" listing (clay is wayfinding, not a status hue).
const FILTER_DOT: Record<Filter, string> = {
  all: "bg-neutral-400",
  open: "bg-rescued-600",
  "coming up": "bg-clay-600",
  claimed: "bg-urgent-600",
  "in transit": "bg-transit-600",
  delivered: "bg-rescued-600",
};

// Fuller phrasing for the dropdown, where there's room to be explicit (the old
// pills were tight on space). Sentence case, never title case.
const FILTER_LABEL: Record<Filter, string> = {
  all: "all listings",
  open: "available to claim",
  "coming up": "coming up",
  claimed: "claimed",
  "in transit": "in transit",
  delivered: "delivered",
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("transition-transform duration-200", open && "rotate-180")}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// A clean single dropdown in place of the row of filter pills. Closes on outside
// click or Escape; the trigger and each row carry the status dot + mono count so
// it speaks the same color language as the cards. menuitemradio semantics give
// it a correct, keyboard-navigable selected state.
function FilterDropdown({
  filter,
  counts,
  onChange,
}: {
  filter: Filter;
  counts: Record<string, number>;
  onChange: (f: Filter) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative w-full sm:w-72">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex w-full items-center gap-2.5 rounded-full border bg-card px-4 py-2.5 text-sm transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50",
          open
            ? "border-neutral-900/15 shadow-lift"
            : "border-neutral-200/60 shadow-card hover:shadow-lift"
        )}
      >
        <span
          className={cn("h-2 w-2 rounded-full", FILTER_DOT[filter])}
          aria-hidden="true"
        />
        <span className="truncate font-medium text-neutral-900">
          {FILTER_LABEL[filter]}
        </span>
        <span className="ml-auto flex items-center gap-2 pl-2 text-neutral-600">
          <span className="font-mono text-xs tabular-nums text-neutral-700">
            {counts[filter] ?? 0}
          </span>
          <Chevron open={open} />
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Filter listings"
          className="absolute left-0 top-full z-dropdown mt-2 w-full origin-top animate-scale-in rounded-2xl border border-neutral-200/60 bg-card p-1.5 shadow-lift"
        >
          {FILTERS.map((f) => {
            const active = f === filter;
            return (
              <button
                key={f}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(f);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400",
                  active
                    ? "bg-neutral-900 font-medium text-neutral-50"
                    : "text-neutral-800 hover:bg-neutral-100"
                )}
              >
                <span
                  className={cn("h-2 w-2 shrink-0 rounded-full", FILTER_DOT[f])}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">{FILTER_LABEL[f]}</span>
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    active ? "text-neutral-300" : "text-neutral-600"
                  )}
                >
                  {counts[f] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
      // Everything claimable-or-past, minus the scheduled posts (own pill).
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
      <div className="mb-4">
        <FilterDropdown filter={filter} counts={counts} onChange={setFilter} />
      </div>

      {shown.length > 0 ? (
        <div className="space-y-8">
          {claimable.length > 0 && (
            <section>
              <SectionHeader title="Available to claim" count={claimable.length} />
              <ListingGrid listings={claimable} feature onClaim={onClaim} />
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
