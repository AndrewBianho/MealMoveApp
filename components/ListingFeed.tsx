"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "./cn";
import dynamic from "next/dynamic";
import { ListingCard } from "./ListingCard";
import { EmptyState } from "./EmptyState";
import { capitalize } from "@/lib/text";

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
import { StatusFilterSelect } from "./StatusFilterSelect";
import { useGeolocation } from "./useGeolocation";
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
              "rounded-full px-3 py-1.5 font-mono text-[13px] transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400",
              active
                ? "bg-neutral-900 text-neutral-50"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            )}
          >
            {capitalize(c)}
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
                "rounded-full px-3 py-1.5 text-[14px] font-semibold transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400",
                active ? "bg-neutral-900 text-neutral-50" : "text-neutral-700 hover:text-neutral-900"
              )}
            >
              {capitalize(s)}
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
              "rounded-full px-3 py-1.5 text-[14px] font-semibold transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400",
              active ? "bg-neutral-900 text-neutral-50" : "text-neutral-700 hover:text-neutral-900"
            )}
          >
            {capitalize(v)}
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
      <h2 className="text-[16px] font-semibold text-neutral-800">{title}</h2>
      <span className="font-mono text-[13px] text-neutral-700">{count}</span>
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
      className="mb-3.5 flex w-full items-center gap-2 rounded-lg py-1 text-left text-neutral-700 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
    >
      <Chevron open={open} />
      <h2 className="text-[16px] font-semibold text-neutral-800">{title}</h2>
      <span className="font-mono text-[13px] text-neutral-700">{count}</span>
    </button>
  );
}

// Single-column stack — wide horizontal cards, one per row, in a calm rhythm.
function ListingStack({
  listings,
  claimable = false,
  lead = false,
}: {
  listings: Listing[];
  /** True when the viewer can claim — open cards then link to the detail page
   *  (where the drop-off is chosen and the claim happens). */
  claimable?: boolean;
  /** True for the stack that opens the page — its first photo is the LCP. */
  lead?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {listings.map((l, i) => (
        <ListingCard
          key={l.id}
          listing={l}
          claimable={claimable}
          className={STAGGER[Math.min(i, STAGGER.length - 1)]}
          priorityImage={lead && i === 0}
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

// One future occurrence as a compact row — repeats of a schedule differ only
// by when they open, so date + time + servings is the whole story. Full cards
// are for the soonest occurrence only.
function RepeatRow({ listing }: { listing: Listing }) {
  const d = listing.availableAt ? new Date(listing.availableAt) : null;
  return (
    <li>
      <Link
        href={`/listings/${listing.id}`}
        className="flex items-center gap-3.5 px-4 py-2.5 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rescued-400"
      >
        {d && (
          <span className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-neutral-100 py-1">
            <span className="font-mono text-[13px] text-neutral-700">
              {d.toLocaleDateString([], { weekday: "short" })}
            </span>
            <span className="font-display text-[17px] font-semibold leading-tight text-neutral-900">
              {d.getDate()}
            </span>
          </span>
        )}
        <span className="min-w-0 flex-1 text-[15px] text-neutral-700">
          opens{" "}
          {d
            ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
            : listing.availableLabel}
        </span>
        <span className="shrink-0 font-mono text-[14px] text-neutral-700">
          <span className="font-bold text-neutral-900">{listing.servings}</span>{" "}
          servings
        </span>
      </Link>
    </li>
  );
}

// One recurring schedule's upcoming occurrences. Only the soonest shows by
// default — the rest fold behind a quiet expander, and expand as compact
// date rows rather than repeated near-identical cards, so a daily schedule
// never floods the feed.
function RecurringGroup({ listings }: { listings: Listing[] }) {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = listings;
  const more = rest.length;
  return (
    <div className="flex flex-col gap-6">
      <ListingCard listing={first} />
      {more > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="-mt-1 flex items-center gap-2 self-start rounded-lg py-1 pl-1 pr-2 text-left text-[15px] font-semibold text-neutral-700 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
          >
            <Chevron open={open} />
            {open ? "Hide repeats" : `Show ${more} more ${more === 1 ? "time" : "times"} this schedule`}
          </button>
          {open && (
            <ul className="-mt-1 animate-fade-up divide-y divide-neutral-200/60 overflow-hidden rounded-2xl border border-neutral-200/70 bg-card shadow-card">
              {rest.map((l) => (
                <RepeatRow key={l.id} listing={l} />
              ))}
            </ul>
          )}
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
    <div className="flex flex-col gap-6">
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
    // The "open" count means claimable now — scheduled occurrences count under
    // their own "coming up" pill (though the open/all views also show them, in
    // the separate "Coming up" band).
    const scheduled = listings.filter((l) => l.status === "open" && l.scheduled).length;
    if (c.open) c.open = Math.max(0, c.open - scheduled);
    c["coming up"] = scheduled;
    c.all = listings.length;
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
      list = located;
    } else if (filter === "coming up") {
      list = located.filter((l) => l.status === "open" && l.scheduled);
    } else if (filter === "open") {
      // Scheduled occurrences ride along: the default view shows them in their
      // own "Coming up" band below the claimable food, per the feed spec. The
      // pill counts stay split (open = claimable now, coming up = scheduled).
      list = located.filter((l) => l.status === "open");
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
          <ListingStack listings={claimable} claimable={canClaim} lead />
        </section>
      )}
      {comingUp.length > 0 && (
        <section>
          <SectionHeader title="Coming up" count={comingUpScheduleCount} />
          <p className="-mt-2 mb-3.5 text-[16px] text-neutral-700">
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
    <div>
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusFilterSelect
            value={filter}
            options={FILTERS.map((f) => ({ value: f, label: f, count: counts[f] ?? 0 }))}
            onChange={(v) => setFilter(v as Filter)}
          />
          <div className="flex items-center gap-3">
            {(wide || view === "list") && (
              <SortControl sort={sort} onChange={setSort} located={!!here} />
            )}
            {/* Side by side on wide screens, so the toggle only matters below lg. */}
            {!wide && <ViewToggle view={view} onChange={setView} />}
          </div>
        </div>
        {availableCategories.length >= 2 && (
          <CategoryFilter
            available={availableCategories}
            choice={activeCategory}
            onChange={setCategory}
          />
        )}
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
    </div>
  );
}
