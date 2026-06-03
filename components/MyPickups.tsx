"use client";

import { useMemo } from "react";
import { ListingCard } from "./ListingCard";
import { useListings } from "./store";

export function MyPickups() {
  const { listings } = useListings();

  const { active, past } = useMemo(() => {
    const mine = listings.filter((l) => l.claimedBy === "You");
    return {
      active: mine.filter((l) => ["claimed", "in transit"].includes(l.status)),
      past: mine.filter((l) =>
        ["delivered", "expired", "failed"].includes(l.status)
      ),
    };
  }, [listings]);

  return (
    <>
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-medium">Active</h2>
        {active.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {active.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">
            Nothing in flight right now. Claim a pickup from the feed.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">History</h2>
        {past.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {past.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">No completed pickups yet.</p>
        )}
      </section>
    </>
  );
}
