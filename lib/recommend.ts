import { milesBetween } from "./geo";
import type { DropOffLocation, MapRestaurant } from "./types";

export interface RankedDropOff {
  dropOff: DropOffLocation;
  miles: number;
  /** Can it take everything this restaurant has left? */
  eligible: boolean;
  /** Why it can't, when ineligible (for explaining the match). */
  reason?: string;
}

// Eligible = accepts every category on offer, is refrigerated if anything is
// perishable, and has the capacity for the servings.
export function eligibility(
  r: MapRestaurant,
  d: DropOffLocation
): { eligible: boolean; reason?: string } {
  const missing = r.categories.filter((c) => !d.acceptedCategories.includes(c));
  if (missing.length) return { eligible: false, reason: `can't take ${missing.join(", ")}` };
  if (r.perishable && !d.refrigerated) return { eligible: false, reason: "not refrigerated" };
  if (d.capacity < r.servings) return { eligible: false, reason: "over capacity" };
  return { eligible: true };
}

// All drop-offs ranked: eligible first, then nearest.
export function rankDropOffs(
  r: MapRestaurant,
  dropOffs: DropOffLocation[]
): RankedDropOff[] {
  return dropOffs
    .map((d) => {
      const { eligible, reason } = eligibility(r, d);
      return { dropOff: d, miles: milesBetween(r.lat, r.lng, d.lat, d.lng), eligible, reason };
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return a.miles - b.miles;
    });
}

// The recommendation: nearest eligible drop-off, or null if none qualify.
export function recommendDropOff(
  r: MapRestaurant,
  dropOffs: DropOffLocation[]
): RankedDropOff | null {
  return rankDropOffs(r, dropOffs).find((x) => x.eligible) ?? null;
}
