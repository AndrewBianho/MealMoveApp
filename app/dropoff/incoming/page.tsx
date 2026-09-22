import { redirect } from "next/navigation";
import { DeliverySections } from "@/components/DeliverySections";
import { DropOffNotLinked, DropOffTabShell } from "@/components/DropOffTabShell";
import { loadDropOffConsole } from "@/lib/dropoffConsole";
import { prisma } from "@/lib/prisma";
import { RECEIVED } from "@/lib/handover";

export const dynamic = "force-dynamic";

// The Incoming tab: what's on its way and what's just arrived. Scoped to a
// single `drop_off` account; org admins oversee the chapter elsewhere.
export default async function DropOffIncomingPage() {
  const { isOrgAdmin, own, incoming, arrived } = await loadDropOffConsole();
  if (isOrgAdmin) redirect("/admin/analytics");
  if (!own) return <DropOffNotLinked />;

  // Which arrived deliveries have already been acknowledged, so the control
  // reads as done rather than offering to confirm the same drop-off twice.
  const receivedIds = (
    await prisma.listingEvent.findMany({
      where: { type: RECEIVED, listingId: { in: arrived.map((l) => l.id) } },
      select: { listingId: true },
    })
  ).map((e) => e.listingId);

  return (
    <DropOffTabShell
      title="Incoming"
      subtitle="Deliveries on their way, and what's just arrived."
    >
      <DeliverySections
        incoming={incoming}
        arrived={arrived}
        receivedIds={receivedIds}
      />
    </DropOffTabShell>
  );
}
