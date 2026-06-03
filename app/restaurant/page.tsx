import { RestaurantConsole } from "@/components/RestaurantConsole";
import { auth } from "@/auth";
import { getListings } from "@/lib/listings";
import { getDropOffs } from "@/lib/map";
import { recommendDropOff } from "@/lib/recommend";
import { prisma } from "@/lib/prisma";
import { RESTAURANT } from "@/lib/mock";
import type { FoodCategory, MapRestaurant } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RestaurantPage() {
  const session = await auth();
  const me = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { restaurant: true },
      })
    : null;
  const restaurant =
    me?.restaurant ?? (await prisma.restaurant.findFirst({ where: { name: RESTAURANT } }));

  const [all, dropOffs] = await Promise.all([getListings(), getDropOffs()]);
  const mine = restaurant ? all.filter((l) => l.source === restaurant.name) : [];

  // Recommend a drop-off for the food still on offer.
  const active = mine.filter((l) =>
    ["open", "claimed", "in transit"].includes(l.status)
  );
  let recommendation = null;
  let summary: MapRestaurant | null = null;
  if (restaurant && active.length > 0) {
    summary = {
      id: restaurant.id,
      name: restaurant.name,
      lat: restaurant.lat,
      lng: restaurant.lng,
      servings: active.reduce((s, l) => s + l.servings, 0),
      categories: Array.from(
        new Set(active.map((l) => l.category).filter((c): c is FoodCategory => !!c))
      ),
      perishable: active.some((l) => !!l.perishable),
      count: active.length,
    };
    recommendation = recommendDropOff(summary, dropOffs);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">Restaurant console</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Post tonight&apos;s surplus and track who&apos;s picking it up.
        </p>
      </header>

      {summary && (
        <div className="mb-6 rounded-xl border border-rescued-200 bg-rescued-50 p-4">
          <p className="font-mono text-[10px] uppercase tracking-wide text-rescued-800">
            recommended drop-off · {summary.servings} servings ·{" "}
            {summary.categories.join(", ")}
            {summary.perishable ? " · perishable" : ""}
          </p>
          {recommendation ? (
            <p className="mt-1 text-sm text-neutral-900">
              <span className="font-medium">{recommendation.dropOff.name}</span> —{" "}
              {recommendation.miles.toFixed(1)} mi away, accepts everything you have
              left.
            </p>
          ) : (
            <p className="mt-1 text-sm text-neutral-900">
              No single drop-off can take all of this right now. Posting it lets
              volunteers split the load.
            </p>
          )}
        </div>
      )}

      {restaurant ? (
        <RestaurantConsole
          restaurant={restaurant.name}
          restaurantId={restaurant.id}
          listings={mine}
        />
      ) : (
        <p className="text-sm text-neutral-600">
          Restaurant account not found. Run <code className="font-mono">npm run db:seed</code>.
        </p>
      )}
    </main>
  );
}
