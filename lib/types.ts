// Domain types — these mirror the Prisma models we'll add later
// (FoodListing, Pickup, User). Kept framework-free so they can be the
// single source of truth for both server and client code.

import type { RetrievalHours } from "./hours";

export type Role = "volunteer" | "restaurant" | "drop_off" | "org_admin" | "super_admin";

/** A drop-off's self-reported appetite for food right now — a standing, manual
 *  signal it sets, shown to volunteers choosing where to deliver. Not urgency. */
export type NeedLevel = "low" | "steady" | "high";

export type ListingStatus =
  | "open"
  | "claimed"
  | "in transit"
  | "taken home"
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
  needLevel: NeedLevel;
  notes?: string;
  retrievalHours?: RetrievalHours;
}

/** A candidate destination the claiming volunteer picks from on the listing
 *  detail page — only eligible locations, nearest first (see lib/recommend). */
export interface DropOffChoice {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Straight-line miles from the restaurant. */
  miles: number;
  refrigerated: boolean;
  needLevel: NeedLevel;
  retrievalHours?: RetrievalHours;
  /** Standing restrictions worth reading before choosing (allergens, access…). */
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
  /** Soonest-expiring open listing (else any active one) — lets a map popup
   * deep-link straight to a listing detail page. */
  listingId?: string;
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
  /** True when this is a future/scheduled listing not yet open for claiming. */
  scheduled?: boolean;
  /** Epoch ms when a scheduled listing becomes claimable. */
  availableAt?: number;
  /** Human label for when a scheduled listing opens, e.g. "Thu, 8:00 PM". */
  availableLabel?: string;
  /** How the parent schedule recurs, e.g. "every day" / "weekdays" / "Mon, Wed". */
  recurrence?: string;
  /** Parent recurring-schedule id, when this listing was materialized from one.
   *  Lets the feed group repeat occurrences of the same schedule together. */
  recurringPostId?: string;
  servings: number;
  /** Actual weight in pounds, when the restaurant provides it. */
  weightLbs?: number;
  /** Distance label, e.g. "0.4 mi". */
  distance: string;
  status: ListingStatus;
  /** How many volunteer cars this pickup needs (1 when absent). */
  carsNeeded?: number;
  /** How many cars have claimed so far — an open multi-car listing shows
   *  "x of N cars claimed" until it fills. */
  claimedCount?: number;
  /** Volunteer who claimed it, when claimed/in transit/delivered. */
  claimedBy?: string;
  /** Drop-off destination, shown once claimed. */
  dropOff?: string;
  /** Chosen drop-off id — set at claim time (destination-first claiming);
   *  absent while the listing is still waiting on its first claim. */
  dropOffId?: string;
  /** The drop-off's structured retrieval hours, for the open-now badge. */
  dropOffHours?: RetrievalHours;
  /** Source restaurant coordinates, for the map (present on DB-backed data). */
  lat?: number;
  lng?: number;
  /** Chosen drop-off's coordinates, for directions (present once claimed). */
  dropOffLat?: number;
  dropOffLng?: number;
  category?: FoodCategory;
  perishable?: boolean;
  /** Allergens present in this food, as free-form labels (food-safety surfacing). */
  allergens?: string[];
  /** How the food must be kept in transit — a safety signal. */
  tempHandling?: "hot" | "cold" | "ambient";
  /** Special requests / restraints from the restaurant. */
  notes?: string;
  /** Food photo, falling back to the restaurant's default image. */
  imageUrl?: string;
  /** Epoch ms when the listing was posted — the first lifecycle step. */
  postedAt?: number;
  /** Epoch ms when the active claim was made (present when claimed/in transit). */
  claimedAt?: number;
  /** Epoch ms when the volunteer picked the food up (claimed → in transit).
   *  Sourced from the `in_transit` ListingEvent; filled in by the pickups page. */
  pickedUpAt?: number;
  /** Epoch ms when the food was delivered. */
  deliveredAt?: number;
  /** Epoch ms of the 15-min auto-release deadline. */
  holdUntil?: number;
  /** Epoch ms when the volunteer took the food home to deliver the next day. */
  takenHomeAt?: number;
  /** Epoch ms of the gentle next-day deadline for a taken-home pickup. */
  deliverBy?: number;
  /** Proof photo captured at pickup (claimed → in transit). */
  photoAtPickupUrl?: string;
  /** Proof photo captured at the drop-off (in transit → delivered). */
  photoAtDeliveryUrl?: string;
  /** The volunteer's recorded rescue-accuracy signal, once given. */
  rescueAccuracy?: "yes" | "partly" | "no";
  /** True when the current viewer is on the claim — primary volunteer or buddy. */
  mine?: boolean;
  /** Primary volunteer's name (same as claimedBy; explicit for the buddy UI). */
  primaryName?: string;
  /** The buddy's name, when a second volunteer has joined the pickup. */
  buddyName?: string;
  /** True when the current viewer is the buddy (not the primary) on this claim. */
  iAmBuddy?: boolean;
}

/** A restaurant's recurring surplus schedule, as the console renders it. */
export interface RecurringPostView {
  id: string;
  title: string;
  servings: number;
  daysOfWeek: number[]; // 0=Sun … 6=Sat
  timeOfDay: number; // minutes from local midnight
  windowMinutes: number;
  notes?: string;
  active: boolean;
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

// One past donation a drop-off received — the completed record behind the
// Impact stats. Lifetime history, so it's its own query (not schedule-scoped
// like the live feed). `deliveredAt` is epoch ms; `volunteer` may be absent on
// older data.
export interface DropOffDonation {
  id: string;
  title: string;
  /** Restaurant the food came from. */
  source: string;
  servings: number;
  /** Epoch ms the volunteer marked it delivered. */
  deliveredAt: number;
  /** Volunteer who carried it, when known. */
  volunteer?: string;
}

export type DropOffNoticeKind = "hours" | "conditions" | "general";

// A drop-off's temporary service notice, ready for display. `until` is an epoch
// ms cutoff (omitted = no expiry); only active notices are ever serialized.
export interface DropOffNoticeView {
  id: string;
  kind: DropOffNoticeKind;
  body: string;
  until?: number;
  createdAt: number;
  authorName?: string;
}

// One volunteer's lifetime numbers for their profile. Counts (no status hue);
// completionRate is 0–100. Both seats are credited because delivered events are
// written per-seat (primary and buddy).
export interface VolunteerImpact {
  mealsRescued: number;
  lbsSaved: number;
  pickupsCompleted: number;
  restaurantsHelped: number;
  hoursDriven: number; // time on completed rescues (claim → delivery), one decimal
  completionRate: number; // 0–100, integer
  attempts: number; // delivered + released + failed
}
