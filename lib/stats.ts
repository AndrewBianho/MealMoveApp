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

// Reliability = delivered / claimed, per volunteer who has claimed at least one
// pickup. Non-punitive: a percentage, surfaced highest-first.
export async function getVolunteerReliability(): Promise<Volunteer[]> {
  const users = await prisma.user.findMany({
    where: { role: "volunteer", pickups: { some: {} } },
    select: { id: true, name: true, pickups: { select: { deliveredAt: true } } },
  });

  return users
    .map((u) => {
      const total = u.pickups.length;
      const delivered = u.pickups.filter((p) => p.deliveredAt !== null).length;
      return {
        id: u.id,
        name: u.name,
        pickups: total,
        reliability: Math.round((delivered / total) * 100),
      };
    })
    .sort((a, b) => b.reliability - a.reliability);
}
