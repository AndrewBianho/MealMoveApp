import { prisma } from "./prisma";
import type { ImpactStat, Volunteer, VolunteerImpact } from "./types";

// Pounds use the restaurant-provided weight when available, falling back to a
// servings estimate (~0.8 lb/serving) for donations that weren't weighed.
const LBS_PER_SERVING = 0.8;

// All computed live from the database — no hardcoded numbers.
export async function getImpactStats(): Promise<ImpactStat[]> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [delivered, completedPickups, pickupsThisWeek, restaurants, distinctVolunteers] =
    await Promise.all([
      prisma.foodListing.findMany({
        where: { status: "delivered" },
        select: { servings: true, weightLbs: true },
      }),
      prisma.pickup.findMany({
        where: { deliveredAt: { not: null } },
        select: { claimedAt: true, deliveredAt: true },
      }),
      prisma.pickup.count({ where: { claimedAt: { gte: weekAgo } } }),
      prisma.restaurant.count(),
      prisma.pickup.findMany({
        distinct: ["volunteerId"],
        select: { volunteerId: true },
      }),
    ]);

  const mealsRescued = delivered.reduce((sum, l) => sum + l.servings, 0);
  const lbsRescued = Math.round(
    delivered.reduce(
      (sum, l) => sum + (l.weightLbs ?? l.servings * LBS_PER_SERVING),
      0
    )
  );
  const hoursDriven = Math.round(driveHours(completedPickups));

  return [
    { label: "meals rescued", value: mealsRescued.toLocaleString() },
    { label: "lbs rescued", value: lbsRescued.toLocaleString() },
    { label: "hours driven", value: hoursDriven.toLocaleString() },
    { label: "pickups this week", value: pickupsThisWeek.toLocaleString() },
    { label: "partner restaurants", value: restaurants.toLocaleString() },
    { label: "active volunteers", value: distinctVolunteers.length.toLocaleString() },
  ];
}

// One restaurant's own impact — the same shape as the chapter stats, but every
// query is scoped to this restaurant's listings. "partner restaurants / active
// volunteers" give way to numbers that mean something to a single restaurant:
// the volunteers who've carried its food and the drop-offs that food reached.
export async function getRestaurantImpactStats(
  restaurantId: string
): Promise<ImpactStat[]> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [delivered, completedPickups, pickupsThisWeek, volunteers, dropOffs] =
    await Promise.all([
      prisma.foodListing.findMany({
        where: { restaurantId, status: "delivered" },
        select: { servings: true, weightLbs: true },
      }),
      prisma.pickup.findMany({
        where: { deliveredAt: { not: null }, listing: { restaurantId } },
        select: { claimedAt: true, deliveredAt: true },
      }),
      prisma.pickup.count({
        where: { claimedAt: { gte: weekAgo }, listing: { restaurantId } },
      }),
      prisma.pickup.findMany({
        where: { listing: { restaurantId } },
        distinct: ["volunteerId"],
        select: { volunteerId: true },
      }),
      prisma.foodListing.findMany({
        where: { restaurantId, status: "delivered", dropOffId: { not: null } },
        distinct: ["dropOffId"],
        select: { dropOffId: true },
      }),
    ]);

  const mealsRescued = delivered.reduce((sum, l) => sum + l.servings, 0);
  const lbsRescued = Math.round(
    delivered.reduce((sum, l) => sum + (l.weightLbs ?? l.servings * LBS_PER_SERVING), 0)
  );
  const hoursDriven = Math.round(driveHours(completedPickups));

  return [
    { label: "meals rescued", value: mealsRescued.toLocaleString() },
    { label: "lbs rescued", value: lbsRescued.toLocaleString() },
    { label: "hours driven", value: hoursDriven.toLocaleString() },
    { label: "pickups this week", value: pickupsThisWeek.toLocaleString() },
    { label: "volunteers helped", value: volunteers.length.toLocaleString() },
    { label: "drop-offs reached", value: dropOffs.length.toLocaleString() },
  ];
}

// Hours spent on completed rescues, summed from each pickup's claim → delivery
// elapsed time. We don't track GPS or persist route durations, so this
// claim-to-drop-off span is the honest proxy for time a volunteer was out
// moving food. Returns fractional hours; callers round as they wish.
function driveHours(
  pickups: { claimedAt: Date; deliveredAt: Date | null }[]
): number {
  const ms = pickups.reduce(
    (sum, p) => sum + (p.deliveredAt ? p.deliveredAt.getTime() - p.claimedAt.getTime() : 0),
    0
  );
  return ms / 3_600_000;
}

// Reliability from the event log: completed vs flaked attempts. A delivered
// event counts for the volunteer; a released (hold expired) or failed event
// counts against them. Non-punitive: a percentage, surfaced highest-first.
export async function getVolunteerReliability(): Promise<Volunteer[]> {
  const rows = await prisma.listingEvent.groupBy({
    by: ["actorId", "type"],
    where: {
      actorId: { not: null },
      type: { in: ["delivered", "released", "failed"] },
    },
    _count: { _all: true },
  });

  const tally = new Map<string, { delivered: number; flaked: number }>();
  for (const r of rows) {
    if (!r.actorId) continue;
    const t = tally.get(r.actorId) ?? { delivered: 0, flaked: 0 };
    if (r.type === "delivered") t.delivered += r._count._all;
    else t.flaked += r._count._all;
    tally.set(r.actorId, t);
  }

  const ids = Array.from(tally.keys());
  if (ids.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });

  return users
    .map((u) => {
      const t = tally.get(u.id)!;
      const total = t.delivered + t.flaked;
      return {
        id: u.id,
        name: u.name,
        pickups: total,
        reliability: total > 0 ? Math.round((t.delivered / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.reliability - a.reliability);
}

// A structural slice of the Prisma client — just the delegates this function
// touches. Lets tests inject a fake db without standing up a database.
type ImpactDb = Pick<typeof prisma, "listingEvent" | "foodListing" | "pickup">;

// One volunteer's lifetime profile numbers, all live from the DB. Impact comes
// from the listings they delivered; completion rate reuses the same event types
// and meaning as getVolunteerReliability (delivered vs released/failed), scoped
// to this user. Both seats are credited: markDeliveredWithPhotoFor writes a
// `delivered` event per seat, so a buddy who helped gets equal credit here.
export async function getVolunteerImpact(
  userId: string,
  db: ImpactDb = prisma
): Promise<VolunteerImpact> {
  const events = await db.listingEvent.findMany({
    where: { actorId: userId, type: { in: ["delivered", "released", "failed"] } },
    select: { type: true, listingId: true },
  });

  const deliveredListingIds: string[] = [];
  let flaked = 0;
  for (const e of events) {
    if (e.type === "delivered") deliveredListingIds.push(e.listingId);
    else flaked++;
  }

  const delivered = deliveredListingIds.length;
  const attempts = delivered + flaked;
  const completionRate =
    attempts > 0 ? Math.round((delivered / attempts) * 100) : 0;

  const listings = deliveredListingIds.length
    ? await db.foodListing.findMany({
        where: { id: { in: deliveredListingIds } },
        select: { servings: true, weightLbs: true, restaurantId: true },
      })
    : [];

  const mealsRescued = listings.reduce((sum, l) => sum + l.servings, 0);
  const lbsSaved = Math.round(
    listings.reduce(
      (sum, l) => sum + (l.weightLbs ?? l.servings * LBS_PER_SERVING),
      0
    )
  );

  // Hours on the road, from the claim → delivery span of each rescue this user
  // completed. Both seats are credited equally (a buddy who helped delivered
  // the same listing), matching how meals/lbs are credited above.
  const pickups = deliveredListingIds.length
    ? await db.pickup.findMany({
        where: { listingId: { in: deliveredListingIds }, deliveredAt: { not: null } },
        select: { claimedAt: true, deliveredAt: true },
      })
    : [];
  const hoursDriven = Math.round(driveHours(pickups) * 10) / 10;

  return {
    mealsRescued,
    lbsSaved,
    pickupsCompleted: delivered,
    restaurantsHelped: new Set(listings.map((l) => l.restaurantId)).size,
    hoursDriven,
    completionRate,
    attempts,
  };
}
