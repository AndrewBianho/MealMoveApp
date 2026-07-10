import { redirect } from "next/navigation";
import { DeliverySections } from "@/components/DeliverySections";
import { DropOffNotLinked, DropOffTabShell } from "@/components/DropOffTabShell";
import { loadDropOffConsole } from "@/lib/dropoffConsole";

export const dynamic = "force-dynamic";

// The Incoming tab: what's on its way and what's just arrived. Org admins see
// the chapter-wide inbound board on /dropoff instead.
export default async function DropOffIncomingPage() {
  const { isOrgAdmin, own, incoming, arrived } = await loadDropOffConsole();
  if (isOrgAdmin) redirect("/dropoff");
  if (!own) return <DropOffNotLinked />;

  return (
    <DropOffTabShell
      title="Incoming"
      subtitle="Deliveries on their way, and what's just arrived."
    >
      <DeliverySections incoming={incoming} arrived={arrived} />
    </DropOffTabShell>
  );
}
