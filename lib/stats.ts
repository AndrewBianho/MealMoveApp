import { prisma } from "./prisma";
import type {
  DropOffDonation,
  ImpactStat,
  Volunteer,
  VolunteerImpact,
} from "./types";

// Pounds use the restaurant-provided weight when available, falling back to a
// servings estimate (~0.8 lb/serving) for donations that weren't weighed.
const LBS_PER_SERVING = 0.8;

// All computed live from the database — no hardcoded numbers. Scoped to the
// viewer's world (`demo`): the curated demo world and the chapter's real data
// never mix, so a real account's totals never include seeded demo rows. A
// pickup/event has no `demo` of its own — its world is its listing's.
export async function getImpactStats(demo: boolean): Promise<ImpactStat[]> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Run sequentially, not Promise.all: this page is the app's heaviest fan-out,
  // and parallel queries each check out a separate pooled connection at once —
  // enough page views and they exhaust the connection pool (EMAXCONNSESSION).
  // One connection at a time keeps the impact page from starving everything
  // else; it's a stats screen, so the small latency cost is fine.
  const delivered = await prisma.foodListing.findMany({
    where: { status: "delivered", demo },
    select: { servings: true, weightLbs: true },
  });
  const completedPickups = await prisma.pickup.findMany({
    where: { deliveredAt: { not: null }, listing: { demo } },
    select: { claimedAt: true, deliveredAt: true },
  });
  const pickupsThisWeek = await prisma.pickup.count({
    where: { claimedAt: { gte: weekAgo }, listing: { demo } },
  });
  const restaurants = await prisma.restaurant.count({ where: { demo } });
  const distinctVolunteers = await prisma.pickup.findMany({
    where: { listing: { demo } },
    distinct: ["volunteerId"],
    select: { volunteerId: true },
  });

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
  restaurantId: string,
  demo: boolean
): Promise<ImpactStat[]> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Sequential for the same reason as getImpactStats: one pooled connection at a
  // time keeps the impact page off the connection-pool ceiling (EMAXCONNSESSION).
  // Scoped to the viewer's world too — a restaurant that posted while browsing
  // the demo world holds demo listings under its real id, so id alone can mix.
  const delivered = await prisma.foodListing.findMany({
    where: { restaurantId, status: "delivered", demo },
    select: { servings: true, weightLbs: true },
  });
  const completedPickups = await prisma.pickup.findMany({
    where: { deliveredAt: { not: null }, listing: { restaurantId, demo } },
    select: { claimedAt: true, deliveredAt: true },
  });
  const pickupsThisWeek = await prisma.pickup.count({
    where: { claimedAt: { gte: weekAgo }, listing: { restaurantId, demo } },
  });
  const volunteers = await prisma.pickup.findMany({
    where: { listing: { restaurantId, demo } },
    distinct: ["volunteerId"],
    select: { volunteerId: true },
  });
  const dropOffs = await prisma.foodListing.findMany({
    where: { restaurantId, status: "delivered", dropOffId: { not: null }, demo },
    distinct: ["dropOffId"],
    select: { dropOffId: true },
  });

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

// One drop-off's own impact — the same shape as the chapter stats, scoped to
// food that actually reached this location. Framed as "received" rather than
// "rescued": this is the destination's side of the same deliveries.
export async function getDropOffImpactStats(
  dropOffId: string,
  demo: boolean
): Promise<ImpactStat[]> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Sequential for the same reason as getImpactStats: one pooled connection at a
  // time keeps the impact surface off the connection-pool ceiling. Scoped to the
  // viewer's world so a real location's totals never include seeded demo rows.
  const delivered = await prisma.foodListing.findMany({
    where: { dropOffId, status: "delivered", demo },
    select: { servings: true, weightLbs: true },
  });
  const arrivalsThisWeek = await prisma.pickup.count({
    where: { deliveredAt: { gte: weekAgo }, listing: { dropOffId, demo } },
  });
  const restaurants = await prisma.foodListing.findMany({
    where: { dropOffId, status: "delivered", demo },
    distinct: ["restaurantId"],
    select: { restaurantId: true },
  });
  const volunteers = await prisma.pickup.findMany({
    where: { deliveredAt: { not: null }, listing: { dropOffId, demo } },
    distinct: ["volunteerId"],
    select: { volunteerId: true },
  });

  const mealsReceived = delivered.reduce((sum, l) => sum + l.servings, 0);
  const lbsReceived = Math.round(
    delivered.reduce((sum, l) => sum + (l.weightLbs ?? l.servings * LBS_PER_SERVING), 0)
  );

  return [
    { label: "meals received", value: mealsReceived.toLocaleString() },
    { label: "lbs received", value: lbsReceived.toLocaleString() },
    { label: "donations received", value: delivered.length.toLocaleString() },
    { label: "arrivals this week", value: arrivalsThisWeek.toLocaleString() },
    { label: "partner restaurants", value: restaurants.length.toLocaleString() },
    { label: "volunteers helped", value: volunteers.length.toLocaleString() },
  ];
}

// A drop-off's lifetime record of completed donations — the list behind the
// Impact stats. All-time (not schedule-scoped like the live feed), newest
// first, capped so a long-running location's page stays light.
export async function getDropOffDonations(
  dropOffId: string,
  demo: boolean,
  take = 60
): Promise<DropOffDonation[]> {
  const rows = await prisma.foodListing.findMany({
    where: { dropOffId, status: "delivered", demo },
    select: {
      id: true,
      title: true,
      servings: true,
      restaurant: { select: { name: true } },
      pickups: {
        where: { deliveredAt: { not: null } },
        orderBy: { deliveredAt: "desc" },
        take: 1,
        select: { deliveredAt: true, volunteer: { select: { name: true } } },
      },
    },
  });

  return rows
    .map((l) => {
      const pick = l.pickups[0];
      return {
        id: l.id,
        title: l.title,
        source: l.restaurant.name,
        servings: l.servings,
        deliveredAt: pick?.deliveredAt?.getTime() ?? 0,
        volunteer: pick?.volunteer?.name ?? undefined,
      };
    })
    .sort((a, b) => b.deliveredAt - a.deliveredAt)
    .slice(0, take);
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
export async function getVolunteerReliability(demo: boolean): Promise<Volunteer[]> {
  const rows = await prisma.listingEvent.groupBy({
    by: ["actorId", "type"],
    where: {
      actorId: { not: null },
      type: { in: ["delivered", "released", "failed"] },
      // An event's world is its listing's — keep demo/real reliability separate.
      listing: { demo },
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
  demo: boolean,
  db: ImpactDb = prisma
): Promise<VolunteerImpact> {
  // Scoped to the viewer's world: a real volunteer who explored the demo world
  // has demo deliveries under the same actorId, so world scoping keeps their
  // real harvest free of demo rows (an event's world is its listing's).
  const events = await db.listingEvent.findMany({
    where: {
      actorId: userId,
      type: { in: ["delivered", "released", "failed"] },
      listing: { demo },
    },
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
