import { prisma } from "./prisma";
import { parseStoredHours } from "./hours";
import { isDemo } from "./mode";
import type { DropOffLocation, FoodCategory, MapRestaurant } from "./types";

// Restaurants (with their currently-open listings summarized) + all drop-offs,
// for the map. Pins are restricted to pickups a volunteer can act on right now:
// status "open" AND already live — future/scheduled listings (availableAt in the
// future) and claimed/in-transit ones are left off the map.
export async function getMapData(): Promise<{
  restaurants: MapRestaurant[];
  dropOffs: DropOffLocation[];
}> {
  const demo = await isDemo(); // scope the whole map to the viewer's world
  const now = new Date();
  const [restaurants, dropOffs] = await Promise.all([
    prisma.restaurant.findMany({
      where: { demo },
      include: {
        listings: {
          where: {
            demo,
            status: "open",
            OR: [{ availableAt: null }, { availableAt: { lte: now } }],
          },
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
    prisma.dropOff.findMany({ where: { demo }, orderBy: { name: "asc" } }),
  ]);

  const nowMs = now.getTime();
  const mapRestaurants: MapRestaurant[] = restaurants
    .filter((r) => r.listings.length > 0)
    .map((r) => {
      // Every listing here is currently open; the soonest-expiring one drives the
      // pin's urgency and the popup deep-link.
      const soonestOpen = r.listings.reduce<(typeof r.listings)[number] | null>(
        (best, l) => (!best || l.expiresAt < best.expiresAt ? l : best),
        null
      );
      const minutesLeft = soonestOpen
        ? Math.round((soonestOpen.expiresAt.getTime() - nowMs) / 60_000)
        : undefined;
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
    needLevel: d.needLevel,
    notes: d.notes ?? undefined,
    retrievalHours: parseStoredHours(d.retrievalHours) ?? undefined,
  }));

  return { restaurants: mapRestaurants, dropOffs: mapDropOffs };
}

export async function getDropOffs(): Promise<DropOffLocation[]> {
  const dropOffs = await prisma.dropOff.findMany({
    where: { demo: await isDemo() },
    orderBy: { name: "asc" },
  });
  return dropOffs.map((d) => ({
    id: d.id,
    name: d.name,
    lat: d.lat,
    lng: d.lng,
    acceptedCategories: d.acceptedCategories as FoodCategory[],
    refrigerated: d.refrigerated,
    needLevel: d.needLevel,
    notes: d.notes ?? undefined,
    retrievalHours: parseStoredHours(d.retrievalHours) ?? undefined,
  }));
}
