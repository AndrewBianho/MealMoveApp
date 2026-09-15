import { prisma } from "./prisma";
import { occurrencesWithin, SCHEDULE_HORIZON_DAYS } from "./recurring";

// How far ahead we materialize scheduled listings. Every account sees at most
// the next week of upcoming pickups; the sweep tops this up (and prunes past
// the horizon) on every run. Shared with the listing views, which hide
// anything beyond it.
const HORIZON_DAYS = SCHEDULE_HORIZON_DAYS;

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

    // Reconcile before topping up: any future, unclaimed row of this schedule
    // whose availableAt isn't one of the expected instants is off-schedule —
    // e.g. rows written by a deploy that resolved times in the wrong timezone
    // (duplicating every firing) or under an edited rule. Claimed rows and
    // already-live windows are never touched.
    const expected = new Set(occurrences.map((o) => o.availableAt.getTime()));
    const future = await prisma.foodListing.findMany({
      where: {
        recurringPostId: s.id,
        status: "open",
        availableAt: { gt: now },
        pickups: { none: {} },
      },
      select: { id: true, availableAt: true },
    });
    const bogus = future
      .filter((f) => !expected.has(f.availableAt!.getTime()))
      .map((f) => f.id);
    if (bogus.length > 0) {
      await prisma.$transaction([
        prisma.message.deleteMany({ where: { listingId: { in: bogus } } }),
        prisma.buddyInvite.deleteMany({ where: { listingId: { in: bogus } } }),
        prisma.listingEvent.deleteMany({ where: { listingId: { in: bogus } } }),
        prisma.foodListing.deleteMany({ where: { id: { in: bogus } } }),
      ]);
    }

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

  // Keep the visible horizon tight for every account: drop unclaimed future
  // occurrences sitting beyond it — rows materialized under an older, longer
  // horizon, or left behind by a schedule edit. Claimed ones are never touched.
  const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
  const beyond = await prisma.foodListing.findMany({
    where: {
      recurringPostId: { not: null },
      availableAt: { gt: horizonEnd },
      status: "open",
      pickups: { none: {} },
    },
    select: { id: true },
  });
  if (beyond.length > 0) {
    const ids = beyond.map((l) => l.id);
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { listingId: { in: ids } } }),
      prisma.buddyInvite.deleteMany({ where: { listingId: { in: ids } } }),
      prisma.listingEvent.deleteMany({ where: { listingId: { in: ids } } }),
      prisma.foodListing.deleteMany({ where: { id: { in: ids } } }),
    ]);
  }

  return { scheduled };
}

// Expires open listings whose pickup window has passed, writing a ListingEvent
// so expiry is part of the record.
//
// This used to also auto-release claims whose 15-minute hold had lapsed. That
// hold is gone (2026-09-13): a claim now stands until the volunteer delivers it
// or releases it by hand, so nothing here reclaims an abandoned pickup.
type SweepDb = Pick<typeof prisma, "foodListing" | "listingEvent" | "$transaction">;

export async function runSweep(
  deps: { db?: SweepDb } = {}
): Promise<{
  expired: number;
  at: string;
}> {
  const db = deps.db ?? prisma;
  const now = new Date();
  let expired = 0;

  // Expire open listings past their window.
  const stale = await db.foodListing.findMany({
    where: {
      status: "open",
      expiresAt: { lt: now },
      // Curated demo listings never expire — their countdowns are frozen
      // offsets, so expiring them against the wall clock would hollow out the
      // showcase minutes after a reseed. Demo listings materialized from a
      // recurring schedule DO still expire (they carry real future windows),
      // so past occurrences don't pile up in the demo feed.
      NOT: { demo: true, recurringPostId: null },
    },
    select: { id: true },
  });
  for (const listing of stale) {
    await db.$transaction([
      db.foodListing.update({
        where: { id: listing.id },
        data: { status: "expired" },
      }),
      db.listingEvent.create({
        data: { listingId: listing.id, type: "expired" },
      }),
    ]);
    expired++;
  }

  return { expired, at: now.toISOString() };
}
