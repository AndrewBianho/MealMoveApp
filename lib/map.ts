import { prisma } from "./prisma";
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
          select: { servings: true, category: true, perishable: true },
        },
      },
    }),
    prisma.dropOff.findMany({ orderBy: { name: "asc" } }),
  ]);

  const mapRestaurants: MapRestaurant[] = restaurants
    .filter((r) => r.listings.length > 0)
    .map((r) => ({
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
    }));

  const mapDropOffs: DropOffLocation[] = dropOffs.map((d) => ({
    id: d.id,
    name: d.name,
    lat: d.lat,
    lng: d.lng,
    acceptedCategories: d.acceptedCategories as FoodCategory[],
    refrigerated: d.refrigerated,
    capacity: d.capacity,
    notes: d.notes ?? undefined,
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
  }));
}
