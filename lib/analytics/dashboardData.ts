import "server-only";
import { prisma } from "@/lib/prisma";
import { computeFunnel, computeFlakeRate, computeServingsRescued, type PickupRecord } from "./operational";

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
    const types = new Set(l.events.map((e) => e.type));
    const status: PickupRecord["status"] = types.has("delivered")
      ? "delivered"
      : types.has("taken_home")
        ? "taken_home"
        : types.has("in_transit")
          ? "in_transit"
          : types.has("released") || types.has("expired") || types.has("failed")
            ? "flaked"
            : "claimed";
    return { status, servings: l.servings ?? 0 };
  });
  return {
    servingsRescued: computeServingsRescued(pickups),
    flakeRate: computeFlakeRate(pickups),
    funnel: computeFunnel(pickups),
  };
}
