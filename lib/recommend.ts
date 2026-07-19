import { milesBetween } from "./geo";
import type { DropOffLocation, MapRestaurant, NeedLevel } from "./types";

export interface RankedDropOff {
  dropOff: DropOffLocation;
  miles: number;
  /** Can it take everything this restaurant has left? */
  eligible: boolean;
  /** Why it can't, when ineligible (for explaining the match). */
  reason?: string;
}

// Eligible = accepts every category on offer, and is refrigerated if anything
// is perishable.
export function eligibility(
  r: MapRestaurant,
  d: DropOffLocation
): { eligible: boolean; reason?: string } {
  const missing = r.categories.filter((c) => !d.acceptedCategories.includes(c));
  if (missing.length) return { eligible: false, reason: `can't take ${missing.join(", ")}` };
  if (r.perishable && !d.refrigerated) return { eligible: false, reason: "not refrigerated" };
  return { eligible: true };
}

// A higher-need drop-off is ranked as if it were this many miles closer, so it
// can edge out a steady one it's only marginally farther than — a calm nudge
// toward where food is needed, never a wholesale override of distance. Campus
// hauls are short, so the credit is small: a drop-off more than this much closer
// still wins regardless of need. Display always uses the real `miles`.
const NEED_CREDIT_MI: Record<NeedLevel, number> = {
  high: 0.5,
  steady: 0,
  low: -0.5,
};

// The distance the ranking sorts by: real miles discounted by need, so demand
// can break near-ties without overriding a genuinely closer option.
function effectiveMiles(miles: number, needLevel: NeedLevel): number {
  return miles - NEED_CREDIT_MI[needLevel];
}

// All drop-offs ranked: eligible first, then nearest — with a small
// need-aware credit so higher-need drop-offs surface ahead of a steady one
// they're only marginally farther than.
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
      return (
        effectiveMiles(a.miles, a.dropOff.needLevel) -
        effectiveMiles(b.miles, b.dropOff.needLevel)
      );
    });
}

// The recommendation: nearest eligible drop-off, or null if none qualify.
export function recommendDropOff(
  r: MapRestaurant,
  dropOffs: DropOffLocation[]
): RankedDropOff | null {
  return rankDropOffs(r, dropOffs).find((x) => x.eligible) ?? null;
}

export interface RankedRestaurant {
  restaurant: MapRestaurant;
  miles: number;
  /** Can this drop-off take everything the restaurant has on offer? */
  eligible: boolean;
  reason?: string;
}

// The mirror of rankDropOffs, from the drop-off's side: which restaurants can it
// take food from, nearest first. Reuses the same `eligibility` so the two
// directions can never disagree. Used when a drop-off is selected on the map.
export function rankRestaurantsForDropOff(
  d: DropOffLocation,
  restaurants: MapRestaurant[]
): RankedRestaurant[] {
  return restaurants
    .map((r) => {
      const { eligible, reason } = eligibility(r, d);
      return { restaurant: r, miles: milesBetween(d.lat, d.lng, r.lat, r.lng), eligible, reason };
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return a.miles - b.miles;
    });
}
