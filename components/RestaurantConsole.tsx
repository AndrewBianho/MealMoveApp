"use client";

import Link from "next/link";
import { useMemo, useTransition } from "react";
import { ListingCard } from "./ListingCard";
import { NearbyVolunteers } from "./NearbyVolunteers";
import { DonorProtectionNote } from "./DonorProtectionNote";
import { ImageUploadField } from "./ImageUploadField";
import { RecurringPostManager } from "./RecurringPostManager";
import { Toast, useToast } from "./Toast";
import { cn } from "./cn";
import { primaryFill } from "./styles";
import { ArrowRight } from "./icons";
import { setRestaurantImage } from "@/app/actions";
import type { Listing, RecurringPostView } from "@/lib/types";

export function RestaurantConsole({
  restaurant,
  restaurantId,
  restaurantImageUrl,
  listings,
  schedules,
  nearbyVolunteers,
}: {
  restaurant: string;
  restaurantId: string;
  restaurantImageUrl?: string | null;
  listings: Listing[];
  schedules: RecurringPostView[];
  /** Volunteers active near this restaurant right now — the post-time odds. */
  nearbyVolunteers: number;
}) {
  const { message, show } = useToast();
  const [isPending, startTransition] = useTransition();

  // Set/clear the restaurant's default image — used on a card when the listing
  // has no food photo of its own.
  function saveDefaultImage(url: string | null) {
    startTransition(async () => {
      const res = await setRestaurantImage(restaurantId, url);
      show(res.ok ? (url ? "Default photo updated." : "Default photo removed.") : res.error);
    });
  }

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

  return (
    <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
      {/* Left rail: post CTA, default photo, recurring schedules */}
      <div className={cn("space-y-4 lg:sticky lg:top-20 lg:self-start", isPending && "opacity-70")}>
        {/* Post surplus — the form now lives in a focused step-by-step flow. */}
        <div className="rounded-xl border border-neutral-200/40 bg-card p-5">
          <h2 className="text-lg font-medium">Post surplus</h2>
          <p className="mb-3 text-sm text-neutral-700">Posting from {restaurant}.</p>

          {/* Honest expectation signal: how many volunteers are nearby right now,
              so a dead hour reads as a gentle nudge, not silence. */}
          <NearbyVolunteers count={nearbyVolunteers} className="mb-4" />

          <Link
            href="/restaurant/post"
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition-all duration-200",
              "hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0 active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50",
              primaryFill
            )}
          >
            Post surplus
            <ArrowRight className="text-[0.95em]" />
          </Link>

          <DonorProtectionNote variant="inline" />
        </div>

        {/* Restaurant default photo */}
        <div className="rounded-xl border border-neutral-200/40 bg-card p-5">
          <h2 className="text-lg font-medium">Restaurant photo</h2>
          <p className="mb-4 text-sm text-neutral-700">
            Shown on a card when a listing has no food photo of its own.
          </p>
          <ImageUploadField
            label="Default photo"
            hint="Take a photo or upload one — JPG/PNG, up to 5 MB."
            value={restaurantImageUrl}
            onChange={saveDefaultImage}
          />
        </div>

        <RecurringPostManager restaurantId={restaurantId} schedules={schedules} />
      </div>

      {/* Their listings */}
      <div>
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-medium">Live & claimed</h2>
          <p className="mb-4 text-sm text-neutral-700">
            What volunteers can see right now.
          </p>
          {live.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {live.map((l) => (
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
              Nothing posted yet. Tap <span className="font-semibold">Post surplus</span> to add tonight&apos;s food.
            </div>
          )}
        </section>

        {upcoming.length > 0 && (
          <section className="mb-8">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-lg font-medium">Scheduled</h2>
              <span className="font-mono text-xs text-neutral-700">{upcoming.length}</span>
            </div>
            <p className="mb-4 text-sm text-neutral-700">
              From your recurring schedule — each opens to the volunteer feed at
              its listed time.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {upcoming.map((l) => (
                <ListingCard key={l.id} listing={l} audience="restaurant" />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-4 text-lg font-medium">History</h2>
          {past.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {past.map((l) => (
                <ListingCard key={l.id} listing={l} audience="restaurant" />
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-700">No past listings yet.</p>
          )}
        </section>
      </div>

      <Toast message={message} />
    </div>
  );
}
