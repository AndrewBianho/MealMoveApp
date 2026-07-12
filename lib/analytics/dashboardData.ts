import "server-only";
import { prisma } from "@/lib/prisma";
import { computeFunnel, computeFlakeRate, computeServingsRescued, deriveListingStatus, type PickupRecord } from "./operational";

// Lifecycle truth lives in ListingEvent (append-only), not Pickup (no status
// column; flaked/cancelled pickups are deleted rows). One record per claimed
// listing so multi-car listings aren't double-counted, since servings live on
// the listing, not the pickup.
export async function getDashboardData() {
  const claimed = await prisma.foodListing.findMany({
    where: { demo: false, events: { some: { type: "claimed" } } },
    select: { servings: true, events: { select: { type: true } } },
  });
  const pickups: PickupRecord[] = claimed.map((l) => {
    const status = deriveListingStatus(new Set(l.events.map((e) => e.type)));
    return { status, servings: l.servings ?? 0 };
  });
  return {
    servingsRescued: computeServingsRescued(pickups),
    flakeRate: computeFlakeRate(pickups),
    funnel: computeFunnel(pickups),
  };
}
