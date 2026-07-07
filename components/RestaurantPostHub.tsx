"use client";

import Link from "next/link";
import { useTransition } from "react";
import { NearbyVolunteers } from "./NearbyVolunteers";
import { DonorProtectionNote } from "./DonorProtectionNote";
import { ImageUploadField } from "./ImageUploadField";
import { Toast, useToast } from "./Toast";
import { cn } from "./cn";
import { primaryFill } from "./styles";
import { ArrowRight } from "./icons";
import { setRestaurantImage } from "@/app/actions";

/**
 * The posting side of the restaurant surface: the "post tonight's surplus"
 * call-to-action and the restaurant's default photo. Tracking what's already
 * posted lives on its own page (/restaurant/listings → RestaurantListings).
 */
export function RestaurantPostHub({
  restaurant,
  restaurantId,
  restaurantImageUrl,
  nearbyVolunteers,
}: {
  restaurant: string;
  restaurantId: string;
  restaurantImageUrl?: string | null;
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

  return (
    <div className={cn("space-y-4", isPending && "opacity-70")}>
      {/* Post surplus — the form lives in a focused step-by-step flow. */}
      <div className="rounded-xl border border-neutral-200/40 bg-card p-5">
        <h2 className="text-lg font-medium">Tonight&apos;s surplus</h2>
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

      <Toast message={message} />
    </div>
  );
}
