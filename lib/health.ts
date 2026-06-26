import { prisma } from "./prisma";

// Operational metrics for the org-admin health view. These answer "is the system
// working?" — distinct from public impact (meals/pounds). Everything derives from
// existing FoodListing.postedAt + the append-only ListingEvent stream (claimed /
// delivered); no new events were added. The compute step is pure so it's testable
// without a database.

/** One listing reduced to the timestamps the metrics need. */
export interface HealthListing {
  postedAt: number;
  expiresAt: number;
  restaurantId: string;
  /** Earliest "claimed" event for this listing, ms — null if never claimed. */
  claimedAt: number | null;
  /** "delivered" event for this listing, ms — null if never delivered. */
  deliveredAt: number | null;
}

/** A volunteer's first-ever claim: when, and whether that first listing delivered. */
export interface FirstClaim {
  at: number;
  delivered: boolean;
}

/** A ratio plus the raw numerator/denominator so a reader can reconcile it. */
export interface Ratio {
  /** 0–1, or null when there's nothing to divide. */
  value: number | null;
  num: number;
  den: number;
}

export interface HealthMetrics {
  windowDays: number;
  posted: number;
  claimRate: Ratio;
  medianTimeToClaimMin: number | null;
  completionRate: Ratio;
  repeatPostRate: Ratio;
  firstTimeCompletionRate: Ratio;
}

function ratio(num: number, den: number): Ratio {
  return { value: den > 0 ? num / den : null, num, den };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Compute all six ops metrics over a window. Pure: callers pass the listings
 * posted in the window and every volunteer's first-ever claim; this filters and
 * tallies. Rates return null (not 0) when the denominator is empty, so an empty
 * window reads as "no data" rather than a misleading 0%.
 */
export function computeHealthMetrics(
  listings: HealthListing[],
  firstClaims: FirstClaim[],
  windowStart: number,
  windowEnd: number,
  windowDays: number
): HealthMetrics {
  const inWin = listings.filter(
    (l) => l.postedAt >= windowStart && l.postedAt <= windowEnd
  );

  // 1. Claim rate — posted listings that were claimed before they expired.
  const claimedInTime = inWin.filter(
    (l) => l.claimedAt != null && l.claimedAt <= l.expiresAt
  ).length;

  // 2. Median time-to-claim (minutes), over listings that were claimed at all.
  const claimSpansMin = inWin
    .filter((l) => l.claimedAt != null)
    .map((l) => (l.claimedAt! - l.postedAt) / 60_000);
  const medianTimeToClaimMin = median(claimSpansMin);
  const medianRounded =
    medianTimeToClaimMin == null ? null : Math.round(medianTimeToClaimMin);

  // 3. Completion rate — of claimed listings, how many reached delivered.
  const claimed = inWin.filter((l) => l.claimedAt != null);
  const completed = claimed.filter((l) => l.deliveredAt != null).length;

  // 4. Restaurant repeat-post rate — restaurants posting more than once.
  const postsByRestaurant = new Map<string, number>();
  for (const l of inWin) {
    postsByRestaurant.set(l.restaurantId, (postsByRestaurant.get(l.restaurantId) ?? 0) + 1);
  }
  let repeatRestaurants = 0;
  postsByRestaurant.forEach((count) => {
    if (count > 1) repeatRestaurants += 1;
  });

  // 5. First-time-volunteer completion — newcomers whose first claim is in the
  // window, and whether that first rescue completed.
  const firstInWin = firstClaims.filter((f) => f.at >= windowStart && f.at <= windowEnd);
  const firstCompleted = firstInWin.filter((f) => f.delivered).length;

  return {
    windowDays,
    posted: inWin.length,
    claimRate: ratio(claimedInTime, inWin.length),
    medianTimeToClaimMin: medianRounded,
    completionRate: ratio(completed, claimed.length),
    repeatPostRate: ratio(repeatRestaurants, postsByRestaurant.size),
    firstTimeCompletionRate: ratio(firstCompleted, firstInWin.length),
  };
}

/** Load the window's data and compute the metrics. Org-admin view. */
export async function getHealthMetrics(
  windowDays: number,
  demo: boolean
): Promise<HealthMetrics> {
  const windowEnd = Date.now();
  const windowStart = windowEnd - windowDays * 24 * 60 * 60 * 1000;

  const [rows, claims, deliveredRows] = await Promise.all([
    prisma.foodListing.findMany({
      where: { demo, postedAt: { gte: new Date(windowStart), lte: new Date(windowEnd) } },
      select: {
        postedAt: true,
        expiresAt: true,
        restaurantId: true,
        events: {
          where: { type: { in: ["claimed", "delivered"] } },
          select: { type: true, at: true },
          orderBy: { at: "asc" },
        },
      },
    }),
    // All-time claims (scoped to this world) so "first-ever" is genuinely first.
    prisma.listingEvent.findMany({
      where: { type: "claimed", actorId: { not: null }, listing: { demo } },
      select: { actorId: true, at: true, listingId: true },
      orderBy: { at: "asc" },
    }),
    prisma.listingEvent.findMany({
      where: { type: "delivered", listing: { demo } },
      select: { listingId: true },
    }),
  ]);

  const listings: HealthListing[] = rows.map((l) => {
    const claimed = l.events.find((e) => e.type === "claimed");
    const delivered = l.events.find((e) => e.type === "delivered");
    return {
      postedAt: l.postedAt.getTime(),
      expiresAt: l.expiresAt.getTime(),
      restaurantId: l.restaurantId,
      claimedAt: claimed ? claimed.at.getTime() : null,
      deliveredAt: delivered ? delivered.at.getTime() : null,
    };
  });

  const deliveredSet = new Set(deliveredRows.map((r) => r.listingId));
  const firstByActor = new Map<string, { at: number; listingId: string }>();
  for (const c of claims) {
    if (c.actorId && !firstByActor.has(c.actorId)) {
      firstByActor.set(c.actorId, { at: c.at.getTime(), listingId: c.listingId });
    }
  }
  const firstClaims: FirstClaim[] = [];
  firstByActor.forEach((f) => {
    firstClaims.push({ at: f.at, delivered: deliveredSet.has(f.listingId) });
  });

  return computeHealthMetrics(listings, firstClaims, windowStart, windowEnd, windowDays);
}
