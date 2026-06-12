import { prisma } from "./prisma";
import { parseStoredHours } from "./hours";
import type { DropOffLocation, FoodCategory, MapRestaurant } from "./types";

// Restaurants (with active listings summarized) + all drop-offs, for the map.
export async function getMapData(): Promise<{
  restaurants: MapRestaurant[];
  dropOffs: DropOffLocation[];
}> {
  const [restaurants, dropOffs] = await Promise.all([
    prisma.restaurant.findMany({
      include: {
        listings: {
          where: { status: { in: ["open", "claimed", "in_transit"] } },
          select: {
            id: true,
            servings: true,
            category: true,
            perishable: true,
            status: true,
            expiresAt: true,
          },
        },
      },
    }),
    prisma.dropOff.findMany({ orderBy: { name: "asc" } }),
  ]);

  const now = Date.now();
  const mapRestaurants: MapRestaurant[] = restaurants
    .filter((r) => r.listings.length > 0)
    .map((r) => {
      // Urgency is about food still up for grabs — only open listings count.
      const openListings = r.listings.filter((l) => l.status === "open");
      const soonestOpen = openListings.reduce<(typeof openListings)[number] | null>(
        (best, l) => (!best || l.expiresAt < best.expiresAt ? l : best),
        null
      );
      const minutesLeft = soonestOpen
        ? Math.round((soonestOpen.expiresAt.getTime() - now) / 60_000)
        : undefined;
      // Prefer the most-urgent open listing for the popup deep-link; otherwise
      // any active one so the button always has a target.
      const listingId = soonestOpen?.id ?? r.listings[0]?.id;
      return {
        id: r.id,
        name: r.name,
        lat: r.lat,
        lng: r.lng,
        servings: r.listings.reduce((sum, l) => sum + l.servings, 0),
        categories: Array.from(
          new Set(r.listings.map((l) => l.category))
        ) as FoodCategory[],
        perishable: r.listings.some((l) => l.perishable),
        count: r.listings.length,
        listingId,
        minutesLeft,
      };
    });

  const mapDropOffs: DropOffLocation[] = dropOffs.map((d) => ({
    id: d.id,
    name: d.name,
    lat: d.lat,
    lng: d.lng,
    acceptedCategories: d.acceptedCategories as FoodCategory[],
    refrigerated: d.refrigerated,
    capacity: d.capacity,
    notes: d.notes ?? undefined,
    retrievalHours: parseStoredHours(d.retrievalHours) ?? undefined,
  }));

  return { restaurants: mapRestaurants, dropOffs: mapDropOffs };
}

export async function getDropOffs(): Promise<DropOffLocation[]> {
  const dropOffs = await prisma.dropOff.findMany({ orderBy: { name: "asc" } });
  return dropOffs.map((d) => ({
    id: d.id,
    name: d.name,
    lat: d.lat,
    lng: d.lng,
    acceptedCategories: d.acceptedCategories as FoodCategory[],
    refrigerated: d.refrigerated,
    capacity: d.capacity,
    notes: d.notes ?? undefined,
    retrievalHours: parseStoredHours(d.retrievalHours) ?? undefined,
  }));
}
