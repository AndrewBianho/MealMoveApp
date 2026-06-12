import { ListingCard } from "@/components/ListingCard";
import { DropOffNotesEditor } from "@/components/DropOffNotesEditor";
import { RetrievalHoursEditor } from "@/components/RetrievalHoursEditor";
import { TeamPanel } from "@/components/TeamPanel";
import { EmptyState } from "@/components/EmptyState";
import { getDropOffs } from "@/lib/map";
import { getListings } from "@/lib/listings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DropoffPage() {
  const [all, locations] = await Promise.all([getListings(), getDropOffs()]);

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
    (l) => l.dropOff && ["claimed", "in transit"].includes(l.status)
  );
  const arrived = all.filter((l) => l.dropOff && l.status === "delivered");

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">Drop-off locations</h1>
      </header>

      <section className="mb-8 max-w-md">
        <TeamPanel
          members={members}
          invites={invites}
          title="Drop-off team"
          description="Drop-off admins manage every location together. Invite a teammate to add another admin account."
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
                    "rounded-[3px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide " +
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
                    className="rounded-[3px] bg-rescued-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-rescued-800"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <p className="font-mono text-xs text-neutral-600">
                holds up to {d.capacity} servings
              </p>
              <DropOffNotesEditor dropOffId={d.id} initialNotes={d.notes ?? ""} />
              <RetrievalHoursEditor dropOffId={d.id} initialHours={d.retrievalHours} />
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-medium">Incoming</h2>
        {incoming.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {incoming.map((l) => (
              <ListingCard key={l.id} listing={l} audience="dropoff" />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                <path d="M3 10h6l2 3h2l2-3h6" />
              </svg>
            }
            title="Nothing inbound right now"
            hint="Claimed pickups headed your way will appear here."
          />
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">Arrived</h2>
        {arrived.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {arrived.map((l) => (
              <ListingCard key={l.id} listing={l} audience="dropoff" />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            }
            title="No deliveries logged yet"
            hint="Completed drop-offs will be recorded here."
          />
        )}
      </section>
    </main>
  );
}
