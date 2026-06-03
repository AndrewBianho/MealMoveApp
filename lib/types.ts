// Domain types — these mirror the Prisma models we'll add later
// (FoodListing, Pickup, User). Kept framework-free so they can be the
// single source of truth for both server and client code.

export type Role = "volunteer" | "restaurant" | "drop_off_admin" | "org_admin";

export type ListingStatus =
  | "open"
  | "claimed"
  | "in transit"
  | "delivered"
  | "expired"
  | "failed";

export interface Listing {
  id: string;
  title: string;
  /** Restaurant or source location name. */
  source: string;
  /** Human label for the expiry, e.g. "6:51 PM". */
  expiresAt: string;
  /** Minutes until expiry — drives the urgency strip color. */
  minutesLeft: number;
  servings: number;
  /** Distance label, e.g. "0.4 mi". */
  distance: string;
  status: ListingStatus;
  /** Volunteer who claimed it, when claimed/in transit/delivered. */
  claimedBy?: string;
  /** Drop-off destination, shown once claimed. */
  dropOff?: string;
}

export interface Volunteer {
  id: string;
  name: string;
  /** Reliability percentage over the trailing window. */
  reliability: number;
  /** Completed pickups in the trailing window. */
  pickups: number;
}

export interface ImpactStat {
  label: string;
  value: string;
}
