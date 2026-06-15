import { RescueMap } from "@/components/RescueMap";
import { getMapData } from "@/lib/map";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const { restaurants, dropOffs } = await getMapData();

  return (
    // Full-bleed: fill the viewport below the sticky header (and above the mobile
    // bottom nav). The map itself is the page background; RescueMap floats the
    // title, controls, legend, and selection panel over it.
    <main className="relative h-[calc(100dvh_-_4rem_-_4.5rem)] w-full overflow-hidden md:h-[calc(100dvh_-_4rem)]">
      <RescueMap restaurants={restaurants} dropOffs={dropOffs} />
    </main>
  );
}
