import "server-only";
import { prisma } from "@/lib/prisma";
import { computeFunnel, computeServingsRescued, deriveListingStatus, type PickupRecord } from "./operational";

// Lifecycle truth lives in ListingEvent (append-only), not Pickup (no status
// column; flaked/cancelled pickups are deleted rows). One record per claimed
// listing so multi-car listings aren't double-counted, since servings live on
// the listing, not the pickup. Windowed by postedAt + demo-scoped so it lines
// up with getHealthMetrics on the merged Analytics dashboard.
export async function getDashboardData(windowDays: number, demo: boolean) {
  const windowEnd = Date.now();
  const windowStart = windowEnd - windowDays * 24 * 60 * 60 * 1000;
  const claimed = await prisma.foodListing.findMany({
    where: {
      demo,
      postedAt: { gte: new Date(windowStart), lte: new Date(windowEnd) },
      events: { some: { type: "claimed" } },
    },
    select: { servings: true, events: { select: { type: true } } },
  });
  const pickups: PickupRecord[] = claimed.map((l) => {
    const status = deriveListingStatus(new Set(l.events.map((e) => e.type)));
    return { status, servings: l.servings ?? 0 };
  });
  return {
    servingsRescued: computeServingsRescued(pickups),
    funnel: computeFunnel(pickups),
  };
}
