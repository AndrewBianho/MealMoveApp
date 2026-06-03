import { prisma } from "./prisma";

// The anti-flaking engine. Run on a schedule, it:
//   1. Releases claims whose 15-min hold lapsed without the volunteer starting
//      delivery — the listing returns to the feed and the flake is logged.
//   2. Expires open listings whose pickup window has passed.
// Both write ListingEvents, so flaking and expiry become part of the record
// (and feed volunteer reliability).
export async function runSweep(): Promise<{
  released: number;
  expired: number;
  at: string;
}> {
  const now = new Date();
  let released = 0;
  let expired = 0;

  // 1) Auto-release flaked claims.
  const flaked = await prisma.foodListing.findMany({
    where: { status: "claimed", pickup: { holdUntil: { lt: now } } },
    include: { pickup: true },
  });
  for (const listing of flaked) {
    if (!listing.pickup) continue;
    const volunteerId = listing.pickup.volunteerId;
    await prisma.$transaction([
      prisma.pickup.delete({ where: { listingId: listing.id } }),
      prisma.foodListing.update({
        where: { id: listing.id },
        data: { status: "open" },
      }),
      prisma.listingEvent.create({
        data: {
          listingId: listing.id,
          type: "released",
          actorId: volunteerId,
          meta: { reason: "hold_expired" },
        },
      }),
    ]);
    released++;
  }

  // 2) Expire open listings past their window (includes any just re-opened
  //    above whose expiry has also passed).
  const stale = await prisma.foodListing.findMany({
    where: { status: "open", expiresAt: { lt: now } },
    select: { id: true },
  });
  for (const listing of stale) {
    await prisma.$transaction([
      prisma.foodListing.update({
        where: { id: listing.id },
        data: { status: "expired" },
      }),
      prisma.listingEvent.create({
        data: { listingId: listing.id, type: "expired" },
      }),
    ]);
    expired++;
  }

  return { released, expired, at: now.toISOString() };
}
