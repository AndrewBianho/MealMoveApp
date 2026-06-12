import { RescueMap } from "@/components/RescueMap";
import { getMapData } from "@/lib/map";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const { restaurants, dropOffs } = await getMapData();

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">Rescue map</h1>
      </header>

      <RescueMap restaurants={restaurants} dropOffs={dropOffs} />
    </main>
  );
}
