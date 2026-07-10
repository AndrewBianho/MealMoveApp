import { redirect } from "next/navigation";
import { DropOffImpact } from "@/components/DropOffImpact";
import { DropOffNotLinked, DropOffTabShell } from "@/components/DropOffTabShell";
import { loadDropOffConsole } from "@/lib/dropoffConsole";
import { getDropOffDonations, getDropOffImpactStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

// The Impact tab: this location's lifetime stats and the record of past
// donations behind them. Scoped to the single-location account; org admins
// have the chapter-wide /admin/health and /impact surfaces.
export default async function DropOffImpactPage() {
  const { isOrgAdmin, own } = await loadDropOffConsole();
  if (isOrgAdmin) redirect("/dropoff");
  if (!own) return <DropOffNotLinked />;

  // Sequential to stay off the connection-pool ceiling (see lib/stats).
  const stats = await getDropOffImpactStats(own.id);
  const donations = await getDropOffDonations(own.id);

  return (
    <DropOffTabShell
      title="Impact"
      subtitle="What this location has helped rescue, and the donations behind it."
    >
      <DropOffImpact stats={stats} donations={donations} />
    </DropOffTabShell>
  );
}
