import { prisma } from "./prisma";
import { occurrencesWithin } from "./recurring";

// How far ahead we materialize scheduled listings. Volunteers see roughly a week
// and a half of upcoming pickups; the sweep tops this up on every run.
const HORIZON_DAYS = 10;

/**
 * Turn active recurring schedules into real, future FoodListing rows so
 * volunteers can see upcoming pickups. Idempotent: one listing per
 * (schedule, availableAt), so re-running only fills gaps. Each row carries a
 * future `availableAt` — it's visible but locked until then (see claimListing).
 * Can be called standalone (on create / activate) or from the sweep cron.
 */
export async function materializeSchedules(
  now: Date = new Date()
): Promise<{ scheduled: number }> {
  const schedules = await prisma.recurringPost.findMany({
    where: { active: true },
  });
  let scheduled = 0;
  for (const s of schedules) {
    const occurrences = occurrencesWithin(
      {
        daysOfWeek: s.daysOfWeek,
        timeOfDay: s.timeOfDay,
        windowMinutes: s.windowMinutes,
      },
      HORIZON_DAYS,
      now
    );
    for (const o of occurrences) {
      const exists = await prisma.foodListing.findFirst({
        where: { recurringPostId: s.id, availableAt: o.availableAt },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.foodListing.create({
        data: {
          title: s.title,
          servings: s.servings,
          weightLbs: s.weightLbs,
          category: s.category,
          perishable: s.perishable,
          notes: s.notes,
          imageUrl: s.imageUrl,
          demo: s.demo,
          status: "open",
          restaurantId: s.restaurantId,
          recurringPostId: s.id,
          availableAt: o.availableAt,
          postedAt: now,
          expiresAt: o.expiresAt,
          events: { create: { type: "posted", meta: { scheduled: true } } },
        },
      });
      scheduled++;
    }
  }
  return { scheduled };
}

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
      // Cancel any pending buddy invite so a stale one can't later attach a
      // buddy to whoever re-claims this re-opened listing.
      prisma.buddyInvite.updateMany({
        where: { listingId: listing.id, status: "pending" },
        data: { status: "cancelled", respondedAt: now },
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
