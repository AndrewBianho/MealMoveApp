"use client";

import { useMemo, useState } from "react";
import { ListingCard } from "./ListingCard";
import { EmptyState } from "./EmptyState";
import {
  StatusFilterSelect,
  statusOptionsFrom,
} from "./StatusFilterSelect";
import type { Listing } from "@/lib/types";

const STATUS_ORDER = ["open", "claimed", "in transit", "taken home", "delivered"];

/**
 * The Incoming / Arrived sections of the drop-off console, with a shared
 * status dropdown filtering both. When a status is chosen, only the section
 * holding matching cards stays on screen; "all" restores the full page.
 */
export function DeliverySections({
  incoming,
  arrived,
}: {
  incoming: Listing[];
  arrived: Listing[];
}) {
  const [filter, setFilter] = useState("all");
  const options = useMemo(
    () => statusOptionsFrom([...incoming, ...arrived], STATUS_ORDER),
    [incoming, arrived]
  );
  const matches = (l: Listing) => filter === "all" || l.status === filter;
  const shownIncoming = incoming.filter(matches);
  const shownArrived = arrived.filter(matches);
  const filtering = filter !== "all";

  return (
    <>
      {options.length > 1 && (
        <StatusFilterSelect
          value={filter}
          options={options}
          onChange={setFilter}
          selectLabel="Filter deliveries"
          className="mb-6"
        />
      )}

      {(!filtering || shownIncoming.length > 0) && (
        <section className="mb-8">
          <h3 className="mb-4 text-base font-semibold text-neutral-800">In the process</h3>
          {shownIncoming.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shownIncoming.map((l) => (
                <ListingCard key={l.id} listing={l} audience="dropoff" />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                  <path d="M3 10h6l2 3h2l2-3h6" />
                </svg>
              }
              title="Nothing inbound right now"
              hint="Claimed pickups headed your way will appear here."
            />
          )}
        </section>
      )}

      {(!filtering || shownArrived.length > 0) && (
        <section>
          <h3 className="mb-4 text-base font-semibold text-neutral-800">Arrived</h3>
          {shownArrived.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shownArrived.map((l) => (
                <ListingCard key={l.id} listing={l} audience="dropoff" />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              }
              title="No deliveries logged yet"
              hint="Completed drop-offs will be recorded here."
            />
          )}
        </section>
      )}
    </>
  );
}
