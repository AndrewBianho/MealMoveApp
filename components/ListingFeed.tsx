"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { cn } from "./cn";
import dynamic from "next/dynamic";
import { ListingCard } from "./ListingCard";
import { EmptyState } from "./EmptyState";

// Lazy — keep Mapbox (and its CSS) out of the default list bundle; it only loads
// when a volunteer switches to map view. Client-only, with a calm placeholder.
const ListingsMap = dynamic(
  () => import("./ListingsMap").then((m) => m.ListingsMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[60vh] animate-pulse rounded-2xl border border-neutral-200/60 bg-neutral-100" />
    ),
  }
);
import { Toast, useToast } from "./Toast";
import { useGeolocation } from "./useGeolocation";
import { claimListing } from "@/app/actions";
import { haversineMiles, formatMiles } from "@/lib/distance";
import type { Listing, ListingStatus, FoodCategory } from "@/lib/types";

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

type Sort = "closing soon" | "nearest" | "most meals";
const SORTS: Sort[] = ["closing soon", "nearest", "most meals"];

// Canonical food-type order for the category filter (matches the FoodCategory
// enum), so the row reads the same way every time regardless of what's posted.
const CATEGORY_ORDER: FoodCategory[] = [
  "prepared",
  "produce",
  "bakery",
  "packaged",
  "dairy",
  "beverages",
];
type CategoryChoice = FoodCategory | "all types";

// A quiet secondary filter by food type. Only the categories actually present
// are offered, and the whole row hides unless there are at least two to choose
// between — so it never adds noise when there's nothing to narrow.
function CategoryFilter({
  available,
  choice,
  onChange,
}: {
  available: FoodCategory[];
  choice: CategoryChoice;
  onChange: (c: CategoryChoice) => void;
}) {
  const options: CategoryChoice[] = ["all types", ...available];
  return (
    <div
      role="group"
      aria-label="Filter by food type"
      className="flex flex-wrap items-center gap-1.5"
    >
      {options.map((c) => {
        const active = c === choice;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(c)}
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[11px] transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400",
              active
                ? "bg-neutral-900 text-neutral-50"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            )}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

// Sort lets a volunteer order by their actual constraint — soonest to expire,
// closest to them, or biggest haul — rather than a single fixed order. "Nearest"
// needs a shared location; until then it falls back to time order.
function SortControl({
  sort,
  onChange,
  located,
}: {
  sort: Sort;
  onChange: (s: Sort) => void;
  located: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] uppercase tracking-wide text-neutral-500">
        sort
      </span>
      <div className="inline-flex rounded-full border border-neutral-200 bg-card p-0.5">
        {SORTS.map((s) => {
          const active = s === sort;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(s)}
              title={s === "nearest" && !located ? "Share your location to sort by distance" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400",
                active ? "bg-neutral-900 text-neutral-50" : "text-neutral-600 hover:text-neutral-900"
              )}
            >
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// List ↔ Map view of the same filtered listings, without leaving the feed.
type View = "list" | "map";
function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div
      role="group"
      aria-label="List or map view"
      className="inline-flex rounded-full border border-neutral-200 bg-card p-0.5"
    >
      {(["list", "map"] as View[]).map((v) => {
        const active = v === view;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(v)}
            className={cn(
              "rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400",
              active ? "bg-neutral-900 text-neutral-50" : "text-neutral-600 hover:text-neutral-900"
            )}
          >
            {v}
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

// A collapsible "Claimed & closed" header — tracking that's incidental to
// browsing, so it folds away by default (with its count) and one tap expands it.
function CollapsibleSectionHeader({
  title,
  count,
  open,
  onToggle,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="mb-3.5 flex w-full items-center gap-2 rounded-lg py-1 text-left text-neutral-600 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
    >
      <Chevron open={open} />
      <h2 className="text-[15px] font-semibold text-neutral-800">{title}</h2>
      <span className="font-mono text-xs text-neutral-500">{count}</span>
    </button>
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

// Group scheduled listings by their parent recurring schedule, preserving the
// incoming (soonest-first) order. One-off scheduled listings each form their own
// singleton group, so a mixed list stays correctly time-ordered.
function groupBySchedule(items: Listing[]): Listing[][] {
  const groups: Listing[][] = [];
  const byId = new Map<string, Listing[]>();
  for (const l of items) {
    if (l.recurringPostId) {
      let g = byId.get(l.recurringPostId);
      if (!g) {
        g = [];
        byId.set(l.recurringPostId, g);
        groups.push(g);
      }
      g.push(l);
    } else {
      groups.push([l]);
    }
  }
  return groups;
}

// One recurring schedule's upcoming occurrences. Only the soonest shows by
// default — the rest fold behind a quiet expander so a daily/weekly schedule
// doesn't flood the feed with near-identical cards. (Repeat occurrences share
// title/source/servings; they differ only by when they open.)
function RecurringGroup({ listings }: { listings: Listing[] }) {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = listings;
  const more = rest.length;
  return (
    <div className="flex flex-col gap-[18px]">
      <ListingCard listing={first} />
      {more > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="-mt-1 flex items-center gap-2 self-start rounded-lg py-1 pl-1 pr-2 text-left text-[13px] font-semibold text-neutral-600 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
          >
            <Chevron open={open} />
            {open ? "Hide repeats" : `Show ${more} more ${more === 1 ? "time" : "times"} this schedule`}
          </button>
          {open && <ListingStack listings={rest} />}
        </>
      )}
    </div>
  );
}

// "Coming up" rendered as schedules, not raw occurrences: each recurring
// schedule collapses to its next time with an expander for the rest.
function ComingUpStack({ listings }: { listings: Listing[] }) {
  const groups = useMemo(() => groupBySchedule(listings), [listings]);
  return (
    <div className="flex flex-col gap-[18px]">
      {groups.map((g) =>
        g.length === 1 ? (
          <ListingCard key={g[0].id} listing={g[0]} />
        ) : (
          <RecurringGroup key={g[0].recurringPostId} listings={g} />
        )
      )}
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
  const [sort, setSort] = useState<Sort>("closing soon");
  const [category, setCategory] = useState<CategoryChoice>("all types");
  const [view, setView] = useState<View>("list");
  // On wide screens (lg+) the list and map sit side by side, so the List/Map
  // toggle is moot there. Starts false so the server-rendered default is the
  // single-column list (Mapbox stays out of the bundle until we know we're wide).
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  // "Claimed & closed" is tracking, not browsing — collapsed by default for
  // volunteers (who have a dedicated "My pickups" page), expanded for org admins
  // who use the feed for oversight.
  const [closedOpen, setClosedOpen] = useState(!canClaim);
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

  // Numeric miles per listing, for the "nearest" sort (the card's `distance` is a
  // formatted string). Empty until a location is shared.
  const milesById = useMemo(() => {
    const m: Record<string, number> = {};
    if (!here) return m;
    for (const l of listings) {
      if (l.lat != null && l.lng != null) m[l.id] = haversineMiles(here, { lat: l.lat, lng: l.lng });
    }
    return m;
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

  // Food types actually present, in canonical order — drives the category row.
  const availableCategories = useMemo(
    () => CATEGORY_ORDER.filter((c) => listings.some((l) => l.category === c)),
    [listings]
  );
  // If the active category disappears (data refresh) fall back to "all types".
  const activeCategory: CategoryChoice =
    category === "all types" || availableCategories.includes(category)
      ? category
      : "all types";

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
    // AND the food-type filter on top of the status filter.
    if (activeCategory !== "all types") {
      list = list.filter((l) => l.category === activeCategory);
    }
    const by =
      sort === "nearest"
        ? (a: Listing, b: Listing) =>
            (milesById[a.id] ?? Infinity) - (milesById[b.id] ?? Infinity)
        : sort === "most meals"
          ? (a: Listing, b: Listing) => b.servings - a.servings
          : (a: Listing, b: Listing) => a.minutesLeft - b.minutesLeft;
    return [...list].sort((a, b) => {
      // Spent listings always sink to the bottom, whatever the sort.
      if (isSpent(a.status) !== isSpent(b.status)) {
        return Number(isSpent(a.status)) - Number(isSpent(b.status));
      }
      return by(a, b);
    });
  }, [located, filter, sort, milesById, activeCategory]);

  // Split what's shown into three bands so the eye goes to claimable food first.
  const claimable = shown.filter((l) => l.status === "open" && !l.scheduled);
  const comingUp = shown
    .filter((l) => l.status === "open" && l.scheduled)
    .sort((a, b) => (a.availableAt ?? 0) - (b.availableAt ?? 0));
  // Count distinct schedules (one-offs count as one each), so the header reflects
  // what's shown after collapsing — not the raw occurrence count.
  const comingUpScheduleCount = groupBySchedule(comingUp).length;
  const unclaimable = shown.filter((l) => l.status !== "open");

  // Expand the collapsed tracking section when it's the point of the view — an
  // org admin, an explicit tracking filter, or nothing claimable to lead with.
  const trackingFilter =
    filter === "claimed" || filter === "in transit" || filter === "delivered";
  const closedDefaultOpen =
    !canClaim || trackingFilter || (claimable.length === 0 && comingUp.length === 0);
  useEffect(() => {
    setClosedOpen(closedDefaultOpen);
  }, [closedDefaultOpen]);

  const emptyState = (
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
  );

  const listSections = (
    <div className="space-y-9">
      {claimable.length > 0 && (
        <section>
          <SectionHeader title="Available to claim" count={claimable.length} />
          <ListingStack listings={claimable} onClaim={onClaim} />
        </section>
      )}
      {comingUp.length > 0 && (
        <section>
          <SectionHeader title="Coming up" count={comingUpScheduleCount} />
          <p className="-mt-2 mb-3.5 text-sm text-neutral-600">
            Scheduled pickups you can plan around — each opens to claim at its
            listed time.
          </p>
          <ComingUpStack listings={comingUp} />
        </section>
      )}
      {unclaimable.length > 0 && (
        <section>
          <CollapsibleSectionHeader
            title="Claimed & closed"
            count={unclaimable.length}
            open={closedOpen}
            onToggle={() => setClosedOpen((o) => !o)}
          />
          {closedOpen && <ListingStack listings={unclaimable} />}
        </section>
      )}
    </div>
  );

  return (
    <div className={cn(isPending && "opacity-70 transition-opacity")}>
      <div className="mb-6 space-y-3">
        <FilterPills filter={filter} counts={counts} onChange={setFilter} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {availableCategories.length >= 2 ? (
            <CategoryFilter
              available={availableCategories}
              choice={activeCategory}
              onChange={setCategory}
            />
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            {(wide || view === "list") && (
              <SortControl sort={sort} onChange={setSort} located={!!here} />
            )}
            {/* Side by side on wide screens, so the toggle only matters below lg. */}
            {!wide && <ViewToggle view={view} onChange={setView} />}
          </div>
        </div>
      </div>

      {wide ? (
        // Wide screens: the list and a persistent map ride side by side, so a
        // volunteer can scan cards and place them on the map at the same time.
        // The map sticks in view as the list scrolls past it.
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(360px,42%)] items-start gap-7">
          <div>{shown.length === 0 ? emptyState : listSections}</div>
          <div className="sticky top-20 h-[calc(100vh-7rem)]">
            <ListingsMap listings={shown} className="h-full" />
          </div>
        </div>
      ) : shown.length === 0 ? (
        emptyState
      ) : view === "map" ? (
        // Map mirrors the active filters; pins carry their own popups/links.
        <ListingsMap listings={shown} />
      ) : (
        listSections
      )}

      <Toast message={message} />
    </div>
  );
}
