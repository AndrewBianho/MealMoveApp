import { redirect } from "next/navigation";
import { DeliverySections } from "@/components/DeliverySections";
import { DropOffNotLinked, DropOffTabShell } from "@/components/DropOffTabShell";
import { loadDropOffConsole } from "@/lib/dropoffConsole";

export const dynamic = "force-dynamic";

// The Incoming tab: what's on its way and what's just arrived. Scoped to a
// single `drop_off` account; org admins oversee the chapter elsewhere.
export default async function DropOffIncomingPage() {
  const { isOrgAdmin, own, incoming, arrived } = await loadDropOffConsole();
  if (isOrgAdmin) redirect("/");
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
