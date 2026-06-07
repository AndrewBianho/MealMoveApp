// Domain types — these mirror the Prisma models we'll add later
// (FoodListing, Pickup, User). Kept framework-free so they can be the
// single source of truth for both server and client code.

import type { RetrievalHours } from "./hours";

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
  retrievalHours?: RetrievalHours;
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
  /** Minutes until the soonest-expiring OPEN listing; undefined when none are
   * open (all claimed/in transit). Drives the pin's urgency color on the map. */
  minutesLeft?: number;
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
  /** Actual weight in pounds, when the restaurant provides it. */
  weightLbs?: number;
  /** Distance label, e.g. "0.4 mi". */
  distance: string;
  status: ListingStatus;
  /** Volunteer who claimed it, when claimed/in transit/delivered. */
  claimedBy?: string;
  /** Drop-off destination, shown once claimed. */
  dropOff?: string;
  /** The drop-off's structured retrieval hours, for the open-now badge. */
  dropOffHours?: RetrievalHours;
  /** Source restaurant coordinates, for the map (present on DB-backed data). */
  lat?: number;
  lng?: number;
  category?: FoodCategory;
  perishable?: boolean;
  /** Special requests / restraints from the restaurant. */
  notes?: string;
  /** Food photo, falling back to the restaurant's default image. */
  imageUrl?: string;
  /** Epoch ms when the active claim was made (present when claimed/in transit). */
  claimedAt?: number;
  /** Epoch ms of the 15-min auto-release deadline. */
  holdUntil?: number;
  /** Epoch ms of the volunteer's last check-up confirmation, if any. */
  lastCheckInAt?: number;
  /** Proof photo captured at pickup (claimed → in transit). */
  photoAtPickupUrl?: string;
  /** Proof photo captured at the drop-off (in transit → delivered). */
  photoAtDeliveryUrl?: string;
  /** True when the current viewer is on the claim — primary volunteer or buddy. */
  mine?: boolean;
  /** Primary volunteer's name (same as claimedBy; explicit for the buddy UI). */
  primaryName?: string;
  /** The buddy's name, when a second volunteer has joined the pickup. */
  buddyName?: string;
  /** True when the current viewer is the buddy (not the primary) on this claim. */
  iAmBuddy?: boolean;
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

// One volunteer's lifetime numbers for their profile. Counts (no status hue);
// completionRate is 0–100. Both seats are credited because delivered events are
// written per-seat (primary and buddy).
export interface VolunteerImpact {
  mealsRescued: number;
  lbsSaved: number;
  pickupsCompleted: number;
  restaurantsHelped: number;
  completionRate: number; // 0–100, integer
  attempts: number; // delivered + released + failed
}
