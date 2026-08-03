import Link from "next/link";
import { ListingCard } from "@/components/ListingCard";
import { DetailHero } from "@/components/DetailHero";
import { SectionHeading } from "@/components/SectionHeading";
import { DetailEmpty, DetailNotFound } from "@/components/DetailEmpty";
import { getRestaurantDetail } from "@/lib/listings";
import { getDropOffs } from "@/lib/map";
import { recommendDropOff } from "@/lib/recommend";
import { requireUser } from "@/lib/authz";
import { isDemo } from "@/lib/mode";
import type { FoodCategory, MapRestaurant } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RestaurantDetailPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  await requireUser();
  const demo = await isDemo();
  const detail = await getRestaurantDetail(params.id);

  // Not found, or from the other world (demo vs real) — a restaurant the viewer
  // has no business reaching by direct URL is simply "not found".
  if (!detail || detail.restaurant.demo !== demo) {
    return <DetailNotFound label="Restaurant not found." />;
  }

  const { restaurant, listings } = detail;
  const active = listings.filter((l) =>
    ["open", "claimed", "in transit"].includes(l.status)
  );
  const past = listings.filter((l) =>
    ["delivered", "expired", "failed"].includes(l.status)
  );
  const servingsOnOffer = active.reduce((s, l) => s + l.servings, 0);

  let recommendation = null;
  if (active.length > 0) {
    const summary: MapRestaurant = {
      id: restaurant.id,
      name: restaurant.name,
      lat: restaurant.lat,
      lng: restaurant.lng,
      servings: servingsOnOffer,
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
      <DetailHero
        backHref="/map"
        backLabel="Map"
        eyebrow="restaurant"
        title={restaurant.name}
        address={restaurant.address}
        stats={[
          { label: "on offer now", value: active.length },
          { label: "servings", value: servingsOnOffer > 0 ? `~${servingsOnOffer}` : "0" },
          { label: "past rescues", value: past.length },
        ]}
      />

      {recommendation && (
        <div className="mt-6 rounded-2xl border border-rescued-200 bg-rescued-50 p-5">
          <p className="font-mono text-[10px] text-rescued-800">
            Recommended drop-off
          </p>
          <p className="mt-1.5 text-sm text-rescued-800">
            <Link
              href={`/dropoffs/${recommendation.dropOff.id}`}
              className="font-semibold text-clay-600 hover:underline"
            >
              {recommendation.dropOff.name}
            </Link>{" "}
            is{" "}
            <span className="font-mono">{recommendation.miles.toFixed(1)} mi</span>{" "}
            away.
          </p>
        </div>
      )}

      <section className="mt-10">
        <SectionHeading title="On offer now" count={active.length} />
        {active.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {active.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <DetailEmpty>Nothing on offer right now.</DetailEmpty>
        )}
      </section>

      <section className="mt-10">
        <SectionHeading title="History" count={past.length} />
        {past.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {past.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <DetailEmpty>No past rescues yet.</DetailEmpty>
        )}
      </section>
    </main>
  );
}
