import { prisma } from "./prisma";
import { LIVE_LISTING_STATUSES } from "./claims";

// One rescue at a time. A claim is a real commitment — splitting attention
// across several time-sensitive pickups is how food gets stranded — so a
// volunteer with a live claim (either seat, primary or buddy) can't take
// another until it's delivered or released. Release/sweep delete the Pickup
// row, so "an undelivered pickup on a live listing" is exactly "still on it".

type Db = Pick<typeof prisma, "pickup">;

/** The volunteer's current live claim, if any — the thing blocking a new one.
 *  `excludeListingId` skips the listing being acted on, so re-claim guards
 *  elsewhere keep their own (more specific) error message. */
export async function findActiveClaimFor(
  db: Db,
  volunteerId: string,
  excludeListingId?: string
): Promise<{ listingId: string; title: string } | null> {
  const p = await db.pickup.findFirst({
    where: {
      OR: [{ volunteerId }, { buddyId: volunteerId }],
      deliveredAt: null,
      ...(excludeListingId ? { listingId: { not: excludeListingId } } : {}),
      listing: { status: { in: LIVE_LISTING_STATUSES } },
    },
    select: { listingId: true, listing: { select: { title: true } } },
  });
  return p ? { listingId: p.listingId, title: p.listing.title } : null;
}
