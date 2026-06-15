import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { parseStoredHours } from "./hours";
import { isDemo } from "./mode";
import type { Listing, ListingStatus } from "./types";

// Pull the relations the UI needs in one query.
const listingInclude = {
  restaurant: true,
  dropOff: true,
  pickup: { include: { volunteer: true, buddy: true } },
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
    servings: l.servings,
    weightLbs: l.weightLbs ?? undefined,
    distance: "—", // TODO: derive from volunteer location once geo is wired
    status: fromEnum(l.status),
    claimedBy: l.pickup?.volunteer.name,
    dropOff: l.dropOff?.name ?? undefined,
    dropOffHours: parseStoredHours(l.dropOff?.retrievalHours) ?? undefined,
    lat: l.restaurant.lat,
    lng: l.restaurant.lng,
    category: l.category,
    perishable: l.perishable,
    notes: l.notes ?? undefined,
    // Food photo wins; fall back to the restaurant's default image.
    imageUrl: l.imageUrl ?? l.restaurant.imageUrl ?? undefined,
    claimedAt: l.pickup?.claimedAt.getTime(),
    holdUntil: l.pickup?.holdUntil.getTime(),
    lastCheckInAt: l.pickup?.lastCheckInAt?.getTime(),
    photoAtPickupUrl: l.pickup?.photoAtPickupUrl ?? undefined,
    photoAtDeliveryUrl: l.pickup?.photoAtDeliveryUrl ?? undefined,
    mine:
      viewerId != null &&
      (l.pickup?.volunteerId === viewerId || l.pickup?.buddyId === viewerId),
    primaryName: l.pickup?.volunteer.name,
    buddyName: l.pickup?.buddy?.name ?? undefined,
    iAmBuddy: viewerId != null && l.pickup?.buddyId === viewerId,
  };
}

export async function getListings(viewerId?: string): Promise<Listing[]> {
  // Scope the feed to the viewer's world — demo and real never mix.
  const rows = await prisma.foodListing.findMany({
    where: { demo: await isDemo() },
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
  return row ? serializeListing(row, viewerId) : null;
}

export async function getRestaurantDetail(id: string) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id } });
  if (!restaurant) return null;
  const rows = await prisma.foodListing.findMany({
    where: { restaurantId: id },
    include: listingInclude,
    orderBy: { postedAt: "desc" },
  });
  return { restaurant, listings: rows.map((r) => serializeListing(r)) };
}

export async function getDropOffDetail(id: string) {
  const dropOff = await prisma.dropOff.findUnique({ where: { id } });
  if (!dropOff) return null;
  const rows = await prisma.foodListing.findMany({
    where: { dropOffId: id },
    include: listingInclude,
    orderBy: { postedAt: "desc" },
  });
  return { dropOff, listings: rows.map((r) => serializeListing(r)) };
}
