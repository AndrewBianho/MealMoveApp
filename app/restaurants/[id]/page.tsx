import Link from "next/link";
import { ListingCard } from "@/components/ListingCard";
import { getRestaurantDetail } from "@/lib/listings";
import { getDropOffs } from "@/lib/map";
import { recommendDropOff } from "@/lib/recommend";
import type { FoodCategory, MapRestaurant } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RestaurantDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const detail = await getRestaurantDetail(params.id);

  if (!detail) {
    return (
      <main className="mx-auto max-w-[1760px] px-6 py-8">
        <div className="rounded-xl border border-dashed border-neutral-200 bg-card px-6 py-16 text-center">
          <p className="text-sm text-neutral-600">Restaurant not found.</p>
          <Link
            href="/map"
            className="mt-4 inline-block text-sm font-medium text-rescued-600 hover:underline"
          >
            ← Back to the map
          </Link>
        </div>
      </main>
    );
  }

  const { restaurant, listings } = detail;
  const active = listings.filter((l) =>
    ["open", "claimed", "in transit"].includes(l.status)
  );
  const past = listings.filter((l) =>
    ["delivered", "expired", "failed"].includes(l.status)
  );

  let recommendation = null;
  if (active.length > 0) {
    const summary: MapRestaurant = {
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
    recommendation = recommendDropOff(summary, await getDropOffs());
  }

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <Link
        href="/map"
        className="mb-4 inline-block text-sm text-neutral-600 hover:text-neutral-900"
      >
        ← Map
      </Link>

      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">{restaurant.name}</h1>
        <p className="mt-1 font-mono text-xs text-neutral-600">{restaurant.address}</p>
      </header>

      {recommendation && (
        <div className="mb-8 rounded-xl border border-rescued-200 bg-rescued-50 p-4">
          <p className="font-mono text-[10px] uppercase tracking-wide text-rescued-800">
            recommended drop-off
          </p>
          <p className="mt-1 text-sm text-neutral-900">
            <Link
              href={`/dropoffs/${recommendation.dropOff.id}`}
              className="font-medium hover:underline"
            >
              {recommendation.dropOff.name}
            </Link>{" "}
            — {recommendation.miles.toFixed(1)} mi away.
          </p>
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-medium">On offer now</h2>
        {active.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {active.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">Nothing on offer right now.</p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">History</h2>
        {past.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {past.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">No past rescues yet.</p>
        )}
      </section>
    </main>
  );
}
