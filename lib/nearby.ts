import { prisma } from "./prisma";
import { milesBetween } from "./geo";

// The "no false hope" signal: how many volunteers are actually within reach of a
// pickup. A restaurant posting into a dead hour should see the odds, not feel
// ignored. Reuses the same volunteer positions the escalating broadcast targets
// (see lib/broadcast.ts).

export const NEARBY_RADIUS_KM = 5;
const KM_PER_MILE = 1.609344;

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeoVolunteer {
  lat: number | null;
  lng: number | null;
}

/**
 * Pure: how many located volunteers fall within `radiusKm` of `point`.
 * Volunteers without a known position never count.
 */
export function countWithin(
  point: GeoPoint,
  volunteers: GeoVolunteer[],
  radiusKm: number = NEARBY_RADIUS_KM
): number {
  return volunteers.filter(
    (v) =>
      v.lat !== null &&
      v.lng !== null &&
      milesBetween(v.lat, v.lng, point.lat, point.lng) * KM_PER_MILE <= radiusKm
  ).length;
}

/**
 * Active volunteers near a point in the given world (demo/real). "Active" here
 * means a live volunteer account with a known position — who *could* show up,
 * not who we can push to — so the count stays honest about reach.
 */
export async function countActiveVolunteersNear(
  point: GeoPoint,
  opts: { demo: boolean; radiusKm?: number }
): Promise<number> {
  const volunteers = await prisma.user.findMany({
    where: {
      role: "volunteer",
      status: "active",
      dataMode: opts.demo ? "demo" : "real",
      lat: { not: null },
      lng: { not: null },
    },
    select: { lat: true, lng: true },
  });
  return countWithin(point, volunteers, opts.radiusKm ?? NEARBY_RADIUS_KM);
}
