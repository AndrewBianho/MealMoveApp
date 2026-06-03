import { RescueMap } from "@/components/RescueMap";
import { getMapData } from "@/lib/map";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const { restaurants, dropOffs } = await getMapData();

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">Map</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Restaurants with surplus (●) and drop-off locations (■). Tap a
          restaurant to see only the drop-offs that can take its food, nearest
          recommended.
        </p>
      </header>

      <RescueMap restaurants={restaurants} dropOffs={dropOffs} />
    </main>
  );
}
