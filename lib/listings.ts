import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { parseStoredHours } from "./hours";
import { describeCadence, SCHEDULE_HORIZON_DAYS } from "./recurring";
import { isDemo } from "./mode";
import { pickupStage, LIVE_LISTING_STATUSES } from "./claims";
import type { Listing, ListingStatus } from "./types";

// Pull the relations the UI needs in one query.
const listingInclude = {
  restaurant: true,
  dropOff: true,
  pickups: { include: { volunteer: true, buddy: true } },
  recurringPost: true,
} satisfies Prisma.FoodListingInclude;

type DbListing = Prisma.FoodListingGetPayload<{ include: typeof listingInclude }>;

// "in_transit" (Postgres enum) → "in transit" (UI type).
function fromEnum(status: string): ListingStatus {
  return status.replace(/_/g, " ") as ListingStatus;
}

function minutesUntil(expiresAt: Date): number {
  return Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60_000));
}

function displayMinutesLeft(l: DbListing): number {
  // Demo time is frozen: a demo listing's "minutes left" is the fixed offset it
  // was seeded with (expiresAt − postedAt), not a live countdown — so the
  // urgency bands (open / soon / closing soon) stay put for the whole showcase
  // and the curated set always looks the same. Real listings tick normally.
  if (l.demo) {
    return Math.max(0, Math.round((l.expiresAt.getTime() - l.postedAt.getTime()) / 60_000));
  }
  return minutesUntil(l.expiresAt);
}

/** DB row → the plain shape the client components already consume. */
export function serializeListing(l: DbListing, viewerId?: string): Listing {
  // A future listing (materialized from a recurring schedule) is "scheduled":
  // visible but not yet claimable until availableAt passes.
  const scheduled = !!l.availableAt && l.availableAt.getTime() > Date.now();
  // The viewer's own claim, when they're on one (a multi-car listing carries
  // one pickup per car); otherwise the first claim stands in for the shared
  // fields (claimedBy, timestamps) so single-car behavior is unchanged.
  const own = viewerId
    ? l.pickups.find((p) => p.volunteerId === viewerId || p.buddyId === viewerId)
    : undefined;
  const pick = own ?? l.pickups[0];
  // Per-viewer status: each car advances at its own pace while the listing
  // status trails the slowest car (see lib/claims). A volunteer on a claim sees
  // where *their* car is — e.g. "claimed" even while the listing is still
  // "open" waiting on more cars.
  const status: ListingStatus =
    own && LIVE_LISTING_STATUSES.includes(l.status)
      ? fromEnum(pickupStage(own))
      : fromEnum(l.status);
  return {
    id: l.id,
    title: l.title,
    source: l.restaurant.name,
    expiresAt: l.expiresAt.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    }),
    minutesLeft: displayMinutesLeft(l),
    scheduled,
    availableAt: l.availableAt?.getTime(),
    availableLabel: l.availableAt
      ? l.availableAt.toLocaleString([], {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        })
      : undefined,
    // How the parent schedule recurs ("every day" / "weekdays" / "Mon, Wed") —
    // shown on the scheduled card's pill so the specific next time isn't echoed.
    recurrence: l.recurringPost
      ? describeCadence(l.recurringPost.daysOfWeek) || undefined
      : undefined,
    recurringPostId: l.recurringPostId ?? undefined,
    servings: l.servings,
    weightLbs: l.weightLbs ?? undefined,
    // Placeholder until the client knows where the volunteer is: ListingFeed
    // fills this in from the browser's geolocation (straight-line miles to the
    // restaurant's lat/lng). Stays "—" when location is denied or unavailable.
    distance: "—",
    status,
    carsNeeded: l.carsNeeded ?? undefined,
    claimedCount: l.pickups.length,
    claimedBy: pick?.volunteer.name,
    dropOff: l.dropOff?.name ?? undefined,
    dropOffId: l.dropOffId ?? undefined,
    dropOffHours: parseStoredHours(l.dropOff?.retrievalHours) ?? undefined,
    lat: l.restaurant.lat,
    lng: l.restaurant.lng,
    category: l.category,
    perishable: l.perishable,
    allergens: l.allergens.length > 0 ? l.allergens : undefined,
    tempHandling: l.tempHandling ?? undefined,
    notes: l.notes ?? undefined,
    // Food photo wins; fall back to the restaurant's default image.
    imageUrl: l.imageUrl ?? l.restaurant.imageUrl ?? undefined,
    postedAt: l.postedAt.getTime(),
    claimedAt: pick?.claimedAt.getTime(),
    deliveredAt: pick?.deliveredAt?.getTime(),
    holdUntil: pick?.holdUntil.getTime(),
    takenHomeAt: pick?.takenHomeAt?.getTime(),
    deliverBy: pick?.deliverBy?.getTime(),
    photoAtPickupUrl: pick?.photoAtPickupUrl ?? undefined,
    photoAtDeliveryUrl: pick?.photoAtDeliveryUrl ?? undefined,
    rescueAccuracy: pick?.rescueAccuracy ?? undefined,
    mine: own != null,
    primaryName: pick?.volunteer.name,
    buddyName: pick?.buddy?.name ?? undefined,
    iAmBuddy: own?.buddyId === viewerId && viewerId != null,
  };
}

// Scheduled occurrences are only shown within the schedule horizon — anything
// further out stays hidden on every surface (volunteer feed, restaurant
// listings, drop-off views), even if an older deploy materialized rows beyond
// it. Immediate posts have no availableAt and always pass.
function withinScheduleHorizon(): Prisma.FoodListingWhereInput {
  return {
    OR: [
      { availableAt: null },
      {
        availableAt: {
          lte: new Date(Date.now() + SCHEDULE_HORIZON_DAYS * 86_400_000),
        },
      },
    ],
  };
}

export async function getListings(viewerId?: string): Promise<Listing[]> {
  // Scope the feed to the viewer's world — demo and real never mix.
  const rows = await prisma.foodListing.findMany({
    where: { demo: await isDemo(), ...withinScheduleHorizon() },
    include: listingInclude,
    orderBy: { expiresAt: "asc" },
  });
  return rows.map((r) => serializeListing(r, viewerId));
}

export async function getListing(
  id: string,
  viewerId?: string
): Promise<Listing | null> {
  const row = await prisma.foodListing.findUnique({
    where: { id },
    include: listingInclude,
  });
  if (!row) return null;
  const listing = serializeListing(row, viewerId);
  // "Picked up" time for the lifecycle stepper. The Pickup row doesn't store
  // the claimed → in_transit transition, but the audit log does.
  const picked = await prisma.listingEvent.findFirst({
    where: { listingId: id, type: "in_transit" },
    orderBy: { at: "asc" },
    select: { at: true },
  });
  if (picked) listing.pickedUpAt = picked.at.getTime();
  return listing;
}

export async function getRestaurantDetail(id: string) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id } });
  if (!restaurant) return null;
  const rows = await prisma.foodListing.findMany({
    where: { restaurantId: id, ...withinScheduleHorizon() },
    include: listingInclude,
    orderBy: { postedAt: "desc" },
  });
  return { restaurant, listings: rows.map((r) => serializeListing(r)) };
}

export async function getDropOffDetail(id: string) {
  const dropOff = await prisma.dropOff.findUnique({ where: { id } });
  if (!dropOff) return null;
  const rows = await prisma.foodListing.findMany({
    where: { dropOffId: id, ...withinScheduleHorizon() },
    include: listingInclude,
    orderBy: { postedAt: "desc" },
  });
  return { dropOff, listings: rows.map((r) => serializeListing(r)) };
}
