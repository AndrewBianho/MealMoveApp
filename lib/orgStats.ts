import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

type OrgStatsDb = Pick<PrismaClient, "pickup">;

// Volunteer-facing impact for one organization: totals over delivered pickups
// carried by that org's volunteers. Non-punitive by design — aggregate counts,
// never per-person grades. Restaurants/drop-offs are global and excluded here.
export async function getOrgVolunteerImpact(
  organizationId: string,
  deps: { db?: OrgStatsDb; world?: "real" | "demo" } = {}
): Promise<{ meals: number; volunteers: number; pickups: number }> {
  const db = deps.db ?? prisma;
  const rows = await db.pickup.findMany({
    where: {
      deliveredAt: { not: null },
      volunteer: { organizationId },
      // Keep the two worlds separate: a pickup's world is its listing's.
      ...(deps.world ? { listing: { demo: deps.world === "demo" } } : {}),
    },
    select: { volunteerId: true, listing: { select: { servings: true } } },
  });
  const meals = rows.reduce((sum, p) => sum + (p.listing?.servings ?? 0), 0);
  const volunteers = new Set(rows.map((p) => p.volunteerId)).size;
  return { meals, volunteers, pickups: rows.length };
}
