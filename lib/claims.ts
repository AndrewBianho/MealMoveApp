// Multi-car claims. A listing that needs several cars (FoodListing.carsNeeded)
// carries one Pickup per claiming volunteer and stays open — still on the feed,
// still claimable — until enough volunteers have claimed. These helpers are the
// single source of truth for turning a set of pickups back into one listing
// status, and for reading one volunteer's own stage of the rescue. Pure and
// framework-free so the server actions, the sweep cron, and tests share them.

import type { ListingStatus } from "@prisma/client";

/** The pickup fields the aggregation reads. */
export interface ClaimPickup {
  photoAtPickupUrl: string | null;
  takenHomeAt: Date | null;
  deliveredAt: Date | null;
}

/** How many claims this listing needs before it's fully claimed. */
export function claimsNeeded(carsNeeded: number | null | undefined): number {
  return Math.max(1, carsNeeded ?? 1);
}

/**
 * The listing-level status implied by its pickups. The listing reads as the
 * *earliest* active stage across its cars, so it never looks further along than
 * the food actually is:
 *   - under capacity → open (still claimable);
 *   - anyone not yet picked up → claimed;
 *   - everyone delivered → delivered;
 *   - anyone holding it overnight (rest delivered) → taken_home;
 *   - otherwise → in_transit.
 * With one car needed this reproduces the classic single-pickup lifecycle.
 */
export function aggregateStatus(
  pickups: ClaimPickup[],
  carsNeeded: number | null | undefined
): Extract<ListingStatus, "open" | "claimed" | "in_transit" | "taken_home" | "delivered"> {
  if (pickups.length < claimsNeeded(carsNeeded)) return "open";
  if (pickups.some((p) => !p.photoAtPickupUrl)) return "claimed";
  if (pickups.every((p) => p.deliveredAt)) return "delivered";
  if (pickups.some((p) => p.takenHomeAt && !p.deliveredAt)) return "taken_home";
  return "in_transit";
}

/** One volunteer's own stage of the rescue, read off their pickup row. */
export function pickupStage(
  pickup: ClaimPickup
): "claimed" | "in_transit" | "taken_home" | "delivered" {
  if (pickup.deliveredAt) return "delivered";
  if (pickup.takenHomeAt) return "taken_home";
  if (pickup.photoAtPickupUrl) return "in_transit";
  return "claimed";
}

// Listing statuses under which a claim is still being worked. Spent listings
// (expired/failed) never accept claim activity.
export const LIVE_LISTING_STATUSES: ListingStatus[] = [
  "open",
  "claimed",
  "in_transit",
  "taken_home",
];
