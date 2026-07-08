import { DeliverySections } from "@/components/DeliverySections";
import { DropOffNotesEditor } from "@/components/DropOffNotesEditor";
import { DropOffNoticeManager } from "@/components/DropOffNoticeManager";
import { DropOffChats } from "@/components/DropOffChats";
import { RetrievalHoursEditor } from "@/components/RetrievalHoursEditor";
import { TeamPanel } from "@/components/TeamPanel";
import { getDropOffs } from "@/lib/map";
import { getListings } from "@/lib/listings";
import { getActiveNoticesByDropOff } from "@/lib/dropoffNotices";
import { isDemo } from "@/lib/mode";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function DropoffPage() {
  const session = await auth();
  const viewerId = session?.user?.id;
  const [all, locations] = await Promise.all([getListings(), getDropOffs()]);
  const noticesByDropOff = await getActiveNoticesByDropOff(locations.map((d) => d.id));
  const demo = await isDemo();

  // Drop-off admins are chapter-wide: the "team" is every drop-off admin, and
  // invites add another chapter-wide admin account.
  const members = await prisma.user.findMany({
    where: { role: "drop_off_admin" },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  const invites = await prisma.teamInvite.findMany({
    where: { role: "drop_off_admin", status: "pending" },
    select: { id: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  const incoming = all.filter(
    (l) =>
      l.dropOff &&
      // A multi-car listing stays "open" until every car is claimed, but food
      // is already headed here once anyone has claimed.
      (["claimed", "in transit", "taken home"].includes(l.status) ||
        (l.status === "open" && (l.claimedCount ?? 0) > 0))
  );
  const arrived = all.filter((l) => l.dropOff && l.status === "delivered");

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">Drop-off locations</h1>
        <p className="mt-1 text-sm text-neutral-700">
          Where rescued food is delivered, and what&apos;s inbound to each.
        </p>
      </header>

      <section className="mb-8 max-w-md">
        <TeamPanel
          members={members}
          invites={invites}
          title="Drop-off team"
          description="Drop-off admins manage every location together. Invite a teammate to add another admin account."
          demo={demo}
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-medium">Locations &amp; what they accept</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {locations.map((d) => (
            <div
              key={d.id}
              className="rounded-xl border border-neutral-200/40 bg-card p-4"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{d.name}</h3>
                <span
                  className={
                    "rounded-[3px] px-2 py-0.5 font-mono text-[10px] " +
                    (d.refrigerated
                      ? "bg-transit-50 text-transit-800"
                      : "bg-neutral-50 text-neutral-800")
                  }
                >
                  {d.refrigerated ? "refrigerated" : "ambient"}
                </span>
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {d.acceptedCategories.map((c) => (
                  <span
                    key={c}
                    className="rounded-[3px] bg-rescued-50 px-2 py-0.5 font-mono text-[10px] text-rescued-800"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <p className="font-mono text-xs text-neutral-700">
                holds up to {d.capacity} servings
              </p>
              <DropOffNotesEditor dropOffId={d.id} initialNotes={d.notes ?? ""} />
              <RetrievalHoursEditor dropOffId={d.id} initialHours={d.retrievalHours} />
              <DropOffNoticeManager dropOffId={d.id} initial={noticesByDropOff[d.id] ?? []} />
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-lg font-medium">Conversations</h2>
        <p className="mb-4 text-sm text-neutral-700">
          Every active delivery headed your way, in one place — switch between
          volunteers without leaving the page.
        </p>
        {viewerId ? (
          <DropOffChats
            viewerId={viewerId}
            threads={incoming.map((l) => ({
              id: l.id,
              title: l.title,
              source: l.source,
              dropOff: l.dropOff,
              volunteerName: l.claimedBy,
              status: l.status,
            }))}
          />
        ) : (
          <p className="text-sm text-neutral-700">Sign in to coordinate deliveries.</p>
        )}
      </section>

      <DeliverySections incoming={incoming} arrived={arrived} />
    </main>
  );
}
