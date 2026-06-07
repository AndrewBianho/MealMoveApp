"use client";

import { useMemo, useState, useTransition } from "react";
import { cn } from "./cn";
import { ListingCard } from "./ListingCard";
import { Toast, useToast } from "./Toast";
import { claimListing } from "@/app/actions";
import type { Listing, ListingStatus } from "@/lib/types";

type Filter = "all" | "open" | "claimed" | "in transit" | "delivered";

const FILTERS: Filter[] = ["all", "open", "claimed", "in transit", "delivered"];

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
      <span className="font-mono text-xs text-neutral-400">{count}</span>
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
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {listings.map((l) => (
        <div
          key={l.id}
          className={cn(
            feature && isClosingSoon(l) && "md:col-span-2 lg:col-span-2"
          )}
        >
          <ListingCard listing={l} onClaim={onClaim} />
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

  // Split what's shown into what a volunteer can act on (open) and everything
  // else — claimed, in transit, or closed — so the eye goes to claimable food.
  const claimable = shown.filter((l) => l.status === "open");
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
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50",
                active
                  ? "border-neutral-900 bg-neutral-900 font-medium text-neutral-50"
                  : "border-neutral-200/60 text-neutral-600 hover:bg-white hover:shadow-card"
              )}
            >
              {f}
              <span
                className={cn(
                  "ml-1.5 font-mono text-xs",
                  active ? "text-neutral-300" : "text-neutral-400"
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
          {unclaimable.length > 0 && (
            <section>
              <SectionHeader title="Claimed & closed" count={unclaimable.length} />
              <ListingGrid listings={unclaimable} />
            </section>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-16 text-center">
          <p className="text-lg text-neutral-800">
            No {filter === "all" ? "" : `${filter} `}listings right now
          </p>
          <p className="mt-1 font-mono text-xs text-neutral-400">
            Check back soon — new rescues post throughout the evening.
          </p>
        </div>
      )}

      <Toast message={message} />
    </div>
  );
}
