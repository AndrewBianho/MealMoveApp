import Link from "next/link";
import { NearbyVolunteers } from "./NearbyVolunteers";
import { DonorProtectionNote } from "./DonorProtectionNote";
import { cn } from "./cn";
import { primaryFill } from "./styles";
import { ArrowRight } from "./icons";

/**
 * The posting side of the restaurant surface: the "post tonight's surplus"
 * call-to-action. The default listing photo moved to Settings (it's an account
 * detail, not part of the nightly posting flow); tracking what's already posted
 * lives on its own page (/restaurant/listings → RestaurantListings).
 */
export function RestaurantPostHub({
  restaurant,
  nearbyVolunteers,
}: {
  restaurant: string;
  /** Volunteers active near this restaurant right now — the post-time odds. */
  nearbyVolunteers: number;
}) {
  return (
    <div className="space-y-4">
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
    </div>
  );
}
