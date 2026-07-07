"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ListingCard } from "./ListingCard";
import { StatusFilterSelect, type StatusFilterOption } from "./StatusFilterSelect";
import type { Listing } from "@/lib/types";

/**
 * The tracking side of the restaurant surface: everything this restaurant has
 * posted — live & claimed, scheduled occurrences, and past listings — behind
 * one status filter. Posting lives on /restaurant (RestaurantPostHub).
 */
export function RestaurantListings({
  listings,
  nearbyVolunteers,
}: {
  listings: Listing[];
  /** Volunteers active near this restaurant right now — shown on live cards. */
  nearbyVolunteers: number;
}) {
  // Live = open-now or claimed; exclude scheduled occurrences (those open in the
  // future and belong under "Scheduled") so the restaurant sees what's actually
  // claimable now separately from what's queued.
  const live = useMemo(
    () =>
      listings.filter(
        (l) => (l.status === "open" && !l.scheduled) || l.status === "claimed"
      ),
    [listings]
  );
  const upcoming = useMemo(
    () =>
      listings
        .filter((l) => l.status === "open" && l.scheduled)
        .sort((a, b) => (a.availableAt ?? 0) - (b.availableAt ?? 0)),
    [listings]
  );
  const past = useMemo(
    () =>
      listings.filter((l) =>
        ["in transit", "delivered", "expired", "failed"].includes(l.status)
      ),
    [listings]
  );

  // Status dropdown over the whole listings column. "scheduled" is its own
  // choice (those are "open" in the data but queued, not live); the rest match
  // the card statuses. Only statuses actually present are offered.
  const [filter, setFilter] = useState("all");
  const filterOptions = useMemo(() => {
    const opts: StatusFilterOption[] = [
      { value: "all", label: "all", count: listings.length },
    ];
    const add = (value: string, count: number) => {
      if (count > 0) opts.push({ value, label: value, count });
    };
    add("open", live.filter((l) => l.status === "open").length);
    add("claimed", live.filter((l) => l.status === "claimed").length);
    add("scheduled", upcoming.length);
    for (const s of ["in transit", "delivered", "expired", "failed"]) {
      add(s, past.filter((l) => l.status === s).length);
    }
    return opts;
  }, [listings, live, upcoming, past]);
  const matches = (l: Listing) =>
    filter === "all" ||
    (filter === "scheduled"
      ? l.status === "open" && !!l.scheduled
      : l.status === filter && !(l.status === "open" && l.scheduled));
  const shownLive = live.filter(matches);
  const shownUpcoming = upcoming.filter(matches);
  const shownPast = past.filter(matches);
  const filtering = filter !== "all";

  return (
    <div>
      <StatusFilterSelect
        value={filter}
        options={filterOptions}
        onChange={setFilter}
        className="mb-5"
      />

      {(!filtering || shownLive.length > 0) && (
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-medium">Live & claimed</h2>
          <p className="mb-4 text-sm text-neutral-700">
            What volunteers can see right now.
          </p>
          {shownLive.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {shownLive.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  audience="restaurant"
                  nearbyVolunteers={nearbyVolunteers}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-200 bg-card px-6 py-12 text-center text-sm text-neutral-700">
              Nothing live right now.{" "}
              <Link
                href="/restaurant"
                className="font-semibold text-rescued-600 hover:underline"
              >
                Post surplus
              </Link>{" "}
              to add tonight&apos;s food.
            </div>
          )}
        </section>
      )}

      {shownUpcoming.length > 0 && (
        <section className="mb-8">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-lg font-medium">Scheduled</h2>
            <span className="font-mono text-xs text-neutral-700">{shownUpcoming.length}</span>
          </div>
          <p className="mb-4 text-sm text-neutral-700">
            From your recurring schedule — each opens to the volunteer feed at
            its listed time.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {shownUpcoming.map((l) => (
              <ListingCard key={l.id} listing={l} audience="restaurant" />
            ))}
          </div>
        </section>
      )}

      {(!filtering || shownPast.length > 0) && (
        <section>
          <h2 className="mb-4 text-lg font-medium">History</h2>
          {shownPast.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {shownPast.map((l) => (
                <ListingCard key={l.id} listing={l} audience="restaurant" />
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-700">No past listings yet.</p>
          )}
        </section>
      )}
    </div>
  );
}
