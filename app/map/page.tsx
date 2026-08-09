import { RescueMap } from "@/components/RescueMap";
import { getMapData } from "@/lib/map";
import { auth } from "@/auth";
import { requireRole } from "@/lib/authz";
import { canClaimPickups } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  await requireRole("volunteer", "org_admin");
  const [{ restaurants, dropOffs }, session] = await Promise.all([
    getMapData(),
    auth(),
  ]);
  // Org admins read the map to oversee coverage; only volunteers get the
  // "Claim pickup" CTA in the restaurant popup.
  const canClaim = canClaimPickups(session?.user?.role);

  return (
    // Full-bleed: fill the viewport below the sticky header (and above the mobile
    // bottom nav). The map itself is the page background; RescueMap floats the
    // title, controls, legend, and selection panel over it.
    <main className="relative h-[calc(100dvh_-_4rem_-_4.5rem)] w-full overflow-hidden md:h-[calc(100dvh_-_4rem)]">
      <RescueMap restaurants={restaurants} dropOffs={dropOffs} canClaim={canClaim} />
    </main>
  );
}
