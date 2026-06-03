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
                "rounded-md border px-3 py-1.5 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-transit-400 focus-visible:ring-offset-2",
                active
                  ? "border-neutral-900 bg-neutral-900 font-medium text-neutral-50"
                  : "border-neutral-200/60 text-neutral-600 hover:bg-white"
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((l) => (
            <ListingCard key={l.id} listing={l} onClaim={handleClaim} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-6 py-16 text-center">
          <p className="text-sm text-neutral-600">
            No {filter === "all" ? "" : `${filter} `}listings right now.
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
