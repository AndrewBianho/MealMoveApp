import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { Listing, ListingStatus } from "./types";

// Pull the relations the UI needs in one query.
const listingInclude = {
  restaurant: true,
  dropOff: true,
  pickup: { include: { volunteer: true } },
} satisfies Prisma.FoodListingInclude;

type DbListing = Prisma.FoodListingGetPayload<{ include: typeof listingInclude }>;

// "in_transit" (Postgres enum) → "in transit" (UI type).
function fromEnum(status: string): ListingStatus {
  return status.replace(/_/g, " ") as ListingStatus;
}

function minutesUntil(expiresAt: Date): number {
  return Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60_000));
}

/** DB row → the plain shape the client components already consume. */
export function serializeListing(l: DbListing): Listing {
  return {
    id: l.id,
    title: l.title,
    source: l.restaurant.name,
    expiresAt: l.expiresAt.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    }),
    minutesLeft: minutesUntil(l.expiresAt),
    servings: l.servings,
    weightLbs: l.weightLbs ?? undefined,
    distance: "—", // TODO: derive from volunteer location once geo is wired
    status: fromEnum(l.status),
    claimedBy: l.pickup?.volunteer.name,
    dropOff: l.dropOff?.name ?? undefined,
    lat: l.restaurant.lat,
    lng: l.restaurant.lng,
    category: l.category,
    perishable: l.perishable,
    notes: l.notes ?? undefined,
  };
}

export async function getListings(): Promise<Listing[]> {
  const rows = await prisma.foodListing.findMany({
    include: listingInclude,
    orderBy: { expiresAt: "asc" },
  });
  return rows.map(serializeListing);
}

export async function getListing(id: string): Promise<Listing | null> {
  const row = await prisma.foodListing.findUnique({
    where: { id },
    include: listingInclude,
  });
  return row ? serializeListing(row) : null;
}

export async function getRestaurantDetail(id: string) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id } });
  if (!restaurant) return null;
  const rows = await prisma.foodListing.findMany({
    where: { restaurantId: id },
    include: listingInclude,
    orderBy: { postedAt: "desc" },
  });
  return { restaurant, listings: rows.map(serializeListing) };
}

export async function getDropOffDetail(id: string) {
  const dropOff = await prisma.dropOff.findUnique({ where: { id } });
  if (!dropOff) return null;
  const rows = await prisma.foodListing.findMany({
    where: { dropOffId: id },
    include: listingInclude,
    orderBy: { postedAt: "desc" },
  });
  return { dropOff, listings: rows.map(serializeListing) };
}
