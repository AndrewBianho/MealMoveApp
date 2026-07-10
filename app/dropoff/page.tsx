import { DeliverySections } from "@/components/DeliverySections";
import { DropOffNotesEditor } from "@/components/DropOffNotesEditor";
import { DropOffNoticeManager } from "@/components/DropOffNoticeManager";
import { DropOffChats } from "@/components/DropOffChats";
import { DropOffConstraintsEditor } from "@/components/DropOffConstraintsEditor";
import { NeedLevelControl } from "@/components/NeedLevelControl";
import { RetrievalHoursEditor } from "@/components/RetrievalHoursEditor";
import { TeamPanel } from "@/components/TeamPanel";
import { getDropOffs } from "@/lib/map";
import { getListings } from "@/lib/listings";
import { getActiveNoticesByDropOff } from "@/lib/dropoffNotices";
import { isDemo } from "@/lib/mode";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

// A titled settings card for the drop-off's own console. Fraunces title (via
// globals) over one group of controls; several sit in a responsive grid so the
// surface fills desktop width instead of stranding everything in a narrow column.
function SettingsCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200/40 bg-card p-5 shadow-card sm:p-6">
      <h3 className="mb-4 text-base font-semibold text-neutral-800">{title}</h3>
      {children}
    </div>
  );
}

// The drop-off surface. A `drop_off` account sees only the single location it
// speaks for — its own hours, constraints, need level, inbound deliveries, and
// three-way chats. An org admin inherits the chapter-wide view: every location
// at once (the old drop-off-admin console), so oversight survives the role's
// removal.
export default async function DropoffPage() {
  const session = await auth();
  const viewerId = session?.user?.id;
  const isOrgAdmin = session?.user?.role === "org_admin";

  // A drop-off account is scoped to its own location; an org admin manages all.
  let myDropOffId: string | null = null;
  if (!isOrgAdmin && viewerId) {
    const me = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { dropOffId: true },
    });
    myDropOffId = me?.dropOffId ?? null;
  }

  const [all, allLocations] = await Promise.all([getListings(), getDropOffs()]);
  const demo = await isDemo();

  const locations = isOrgAdmin
    ? allLocations
    : allLocations.filter((d) => d.id === myDropOffId);
  const managedIds = new Set(locations.map((d) => d.id));

  const noticesByDropOff = await getActiveNoticesByDropOff(locations.map((d) => d.id));

  // The team that shares this location: its own members + open invites. Org
  // admins manage roles/accounts on the Members page instead, so no team panel.
  const [members, invites] =
    !isOrgAdmin && myDropOffId
      ? await Promise.all([
          prisma.user.findMany({
            where: { dropOffId: myDropOffId },
            select: { id: true, name: true, email: true },
            orderBy: { createdAt: "asc" },
          }),
          prisma.teamInvite.findMany({
            where: { dropOffId: myDropOffId, role: "drop_off", status: "pending" },
            select: { id: true, email: true },
            orderBy: { createdAt: "asc" },
          }),
        ])
      : [[], []];

  const managed = (l: (typeof all)[number]) =>
    l.dropOffId != null && managedIds.has(l.dropOffId);
  const incoming = all.filter(
    (l) =>
      managed(l) &&
      // A multi-car listing stays "open" until every car is claimed, but food
      // is already headed here once anyone has claimed.
      (["claimed", "in transit", "taken home"].includes(l.status) ||
        (l.status === "open" && (l.claimedCount ?? 0) > 0))
  );
  const arrived = all.filter((l) => managed(l) && l.status === "delivered");

  const own = !isOrgAdmin ? locations[0] : null;

  // A drop-off account whose location hasn't been linked yet (shouldn't happen
  // after approval) gets a calm explanation instead of an empty console.
  if (!isOrgAdmin && !own) {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-8">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
          Drop-off
        </h1>
        <p className="mt-2 text-sm text-neutral-700">
          Your account isn&apos;t linked to a drop-off location yet. An org admin
          approves new drop-offs — reach out to your chapter&apos;s admin if this
          looks wrong.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
        <header className="lg:pt-1">
          <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
            {isOrgAdmin ? "Drop-off locations" : own!.name}
          </h1>
          <p className="mt-1 max-w-md text-sm text-neutral-700">
            {isOrgAdmin
              ? "Where rescued food is delivered, and what's inbound to each."
              : "What you accept, when you're open, and what's on its way to you."}
          </p>
        </header>

        {!isOrgAdmin && myDropOffId && (
          <div className="w-full shrink-0 lg:w-[360px]">
            <TeamPanel
              members={members}
              invites={invites}
              title="Your team"
              description="Everyone here manages this drop-off together. Invite a teammate to add another account for this location."
              demo={demo}
            />
          </div>
        )}
      </div>

      {isOrgAdmin ? (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-medium">Locations &amp; what they accept</h2>
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {locations.map((d) => (
              <div
                key={d.id}
                className="rounded-2xl border border-neutral-200/40 bg-card p-5 shadow-card"
              >
                <h3 className="mb-4 text-base font-semibold text-neutral-800">{d.name}</h3>
                <DropOffConstraintsEditor
                  dropOffId={d.id}
                  initial={{
                    categories: d.acceptedCategories,
                    refrigerated: d.refrigerated,
                  }}
                />
                <div className="mt-5 border-t border-neutral-200/50 pt-4">
                  <NeedLevelControl dropOffId={d.id} initial={d.needLevel} />
                </div>
                <div className="mt-4 border-t border-neutral-200/50 pt-4">
                  <DropOffNotesEditor dropOffId={d.id} initialNotes={d.notes ?? ""} />
                  <RetrievalHoursEditor dropOffId={d.id} initialHours={d.retrievalHours} />
                  <DropOffNoticeManager dropOffId={d.id} initial={noticesByDropOff[d.id] ?? []} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-medium">Your location</h2>
          <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-6 xl:grid-cols-3">
            <SettingsCard title="What you accept">
              <DropOffConstraintsEditor
                dropOffId={own!.id}
                initial={{
                  categories: own!.acceptedCategories,
                  refrigerated: own!.refrigerated,
                }}
              />
              <div className="mt-5 border-t border-neutral-200/50 pt-4">
                <NeedLevelControl dropOffId={own!.id} initial={own!.needLevel} />
              </div>
            </SettingsCard>
            <SettingsCard title="Retrieval hours">
              <RetrievalHoursEditor dropOffId={own!.id} initialHours={own!.retrievalHours} />
            </SettingsCard>
            <SettingsCard title="Requests & notices">
              <DropOffNotesEditor dropOffId={own!.id} initialNotes={own!.notes ?? ""} />
              <DropOffNoticeManager dropOffId={own!.id} initial={noticesByDropOff[own!.id] ?? []} />
            </SettingsCard>
          </div>
        </section>
      )}

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
