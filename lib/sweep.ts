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

  // 1) Auto-release flaked claims. Per-pickup: a multi-car listing can carry
  //    several claims, and one lapsing shouldn't touch the others. A claim is
  //    still in its hold stage until the pickup photo lands; the listing may be
  //    "open" (waiting on more cars) or "claimed" (full).
  const flaked = await prisma.pickup.findMany({
    where: {
      holdUntil: { lt: now },
      photoAtPickupUrl: null,
      listing: { status: { in: ["open", "claimed"] } },
    },
  });
  for (const pickup of flaked) {
    // When this was the last car on the listing, the drop-off choice is
    // released too — the destination belongs to the claim, and whoever claims
    // next picks their own.
    const otherCars = await prisma.pickup.count({
      where: { listingId: pickup.listingId, id: { not: pickup.id } },
    });
    await prisma.$transaction([
      prisma.pickup.delete({ where: { id: pickup.id } }),
      // Dropping a claim always puts the listing back under capacity.
      prisma.foodListing.update({
        where: { id: pickup.listingId },
        data: {
          status: "open",
          ...(otherCars === 0 ? { dropOffId: null } : {}),
        },
      }),
      // Cancel this volunteer's pending buddy invites so a stale one can't
      // later attach a buddy to whoever re-claims. Other cars' invites on the
      // same listing are untouched.
      prisma.buddyInvite.updateMany({
        where: {
          listingId: pickup.listingId,
          inviterId: pickup.volunteerId,
          status: "pending",
        },
        data: { status: "cancelled", respondedAt: now },
      }),
      prisma.listingEvent.create({
        data: {
          listingId: pickup.listingId,
          type: "released",
          actorId: pickup.volunteerId,
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
