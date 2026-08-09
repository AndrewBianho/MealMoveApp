"use client";

import { useState } from "react";
import { PickupTimelineCard } from "./PickupTimelineCard";
import { RescueCelebration } from "./RescueCelebration";
import type { Listing, VolunteerImpact } from "@/lib/types";

type Won = {
  impact: VolunteerImpact;
  servings: number;
  source: string;
  dropOff?: string | null;
};

/**
 * The feed's "your current rescue" slot — the one rescue a volunteer has in
 * flight, advanced in place.
 *
 * Rendered unconditionally (even with no rescue) on purpose. Marking a delivery
 * revalidates the feed, and the delivered listing immediately stops matching
 * "current" — so a celebration owned any deeper in the tree would be torn down
 * by the very action that earned it. Sitting at a fixed position with the
 * celebration in its own state, this component survives that refresh and the
 * payoff moment lands.
 */
export function CurrentRescue({ listing }: { listing: Listing | null }) {
  const [won, setWon] = useState<Won | null>(null);

  return (
    <>
      {listing && (
        <section className="mb-8 lg:max-w-3xl">
          <div className="mb-3.5 flex items-center gap-2">
            <h2 className="text-[16px] font-semibold text-neutral-800">
              Your current rescue
            </h2>
            <span className="font-mono text-[13px] text-neutral-700">
              One at a time
            </span>
          </div>
          <PickupTimelineCard
            listing={listing}
            priorityImage
            featured
            inlineAdvance
            onDelivered={(impact) =>
              setWon({
                impact,
                // Captured now: by the time the celebration renders, this
                // listing has left the feed and the prop is null.
                servings: listing.servings ?? 0,
                source: listing.source,
                dropOff: listing.dropOff,
              })
            }
          />
        </section>
      )}

      {won && (
        <RescueCelebration
          impact={won.impact}
          servings={won.servings}
          source={won.source}
          dropOff={won.dropOff}
          onClose={() => setWon(null)}
        />
      )}
    </>
  );
}
