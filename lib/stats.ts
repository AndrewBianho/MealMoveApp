import { prisma } from "./prisma";
import type { ImpactStat, Volunteer } from "./types";

// All computed live from the database — no hardcoded numbers.
export async function getImpactStats(): Promise<ImpactStat[]> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [mealsAgg, pickupsThisWeek, restaurants, distinctVolunteers] =
    await Promise.all([
      prisma.foodListing.aggregate({
        _sum: { servings: true },
        where: { status: "delivered" },
      }),
      prisma.pickup.count({ where: { claimedAt: { gte: weekAgo } } }),
      prisma.restaurant.count(),
      prisma.pickup.findMany({
        distinct: ["volunteerId"],
        select: { volunteerId: true },
      }),
    ]);

  const mealsRescued = mealsAgg._sum.servings ?? 0;

  return [
    { label: "meals rescued", value: mealsRescued.toLocaleString() },
    { label: "pickups this week", value: pickupsThisWeek.toLocaleString() },
    { label: "partner restaurants", value: restaurants.toLocaleString() },
    { label: "active volunteers", value: distinctVolunteers.length.toLocaleString() },
  ];
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
