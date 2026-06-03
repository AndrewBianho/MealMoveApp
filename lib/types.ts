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

export type FoodCategory =
  | "prepared"
  | "produce"
  | "bakery"
  | "packaged"
  | "dairy"
  | "beverages";

/** A drop-off location and the constraints on what it can take in. */
export interface DropOffLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  acceptedCategories: FoodCategory[];
  refrigerated: boolean;
  capacity: number;
  notes?: string;
}

/** A restaurant on the map, summarizing its active (open/claimed) listings. */
export interface MapRestaurant {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Total servings still on offer. */
  servings: number;
  /** Distinct categories across its active listings. */
  categories: FoodCategory[];
  /** Whether any active listing is perishable. */
  perishable: boolean;
  /** Number of active listings. */
  count: number;
}

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
  /** Source restaurant coordinates, for the map (present on DB-backed data). */
  lat?: number;
  lng?: number;
  category?: FoodCategory;
  perishable?: boolean;
  /** Special requests / restraints from the restaurant. */
  notes?: string;
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
