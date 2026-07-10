import { DeliverySections } from "@/components/DeliverySections";
import { DropOffChats } from "@/components/DropOffChats";
import { DropOffConstraintsEditor } from "@/components/DropOffConstraintsEditor";
import { DropOffNotesEditor } from "@/components/DropOffNotesEditor";
import { DropOffNoticeManager } from "@/components/DropOffNoticeManager";
import { DropOffNotLinked, DropOffTabShell } from "@/components/DropOffTabShell";
import { NeedLevelControl } from "@/components/NeedLevelControl";
import { RetrievalHoursEditor } from "@/components/RetrievalHoursEditor";
import { TeamPanel } from "@/components/TeamPanel";
import { dropOffChatThreads, loadDropOffConsole } from "@/lib/dropoffConsole";

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

// The drop-off console's first tab. For a `drop_off` account this is "About
// us" — everything the location is in charge of (hours, team, what it accepts,
// notices); the other tabs (Conversations / Incoming / Impact) are their own
// routes. An org admin keeps the chapter-wide view here: every location at once
// plus the inbound board, since their nav has a single Drop-off link.
export default async function DropoffPage() {
  const {
    isOrgAdmin,
    myDropOffId,
    locations,
    own,
    demo,
    noticesByDropOff,
    members,
    invites,
    viewerId,
    incoming,
    arrived,
  } = await loadDropOffConsole();

  if (!isOrgAdmin && !own) return <DropOffNotLinked />;

  if (isOrgAdmin) {
    return (
      <DropOffTabShell
        title="Drop-off locations"
        subtitle="Where rescued food is delivered, and what's inbound to each."
      >
        <section className="mb-10">
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
                  initial={{ categories: d.acceptedCategories, refrigerated: d.refrigerated }}
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

        <section className="mb-10">
          <h2 className="mb-1 text-lg font-medium">Conversations</h2>
          <p className="mb-4 text-sm text-neutral-700">
            Every active delivery headed to a location, in one place.
          </p>
          {viewerId ? (
            <DropOffChats viewerId={viewerId} threads={dropOffChatThreads(incoming)} />
          ) : (
            <p className="text-sm text-neutral-700">Sign in to coordinate deliveries.</p>
          )}
        </section>

        <section>
          <h2 className="mb-1 text-lg font-medium">Incoming</h2>
          <p className="mb-4 text-sm text-neutral-700">
            Deliveries on their way, and what&apos;s just arrived.
          </p>
          <DeliverySections incoming={incoming} arrived={arrived} />
        </section>
      </DropOffTabShell>
    );
  }

  return (
    <DropOffTabShell
      title={own!.name}
      subtitle="What you're in charge of — your opening times, your team, what you accept, and any notices for volunteers on their way."
    >
      <div className="grid items-start gap-4 md:grid-cols-2 lg:gap-6">
        <SettingsCard title="What you accept">
          <DropOffConstraintsEditor
            dropOffId={own!.id}
            initial={{ categories: own!.acceptedCategories, refrigerated: own!.refrigerated }}
          />
          <div className="mt-5 border-t border-neutral-200/50 pt-4">
            <NeedLevelControl dropOffId={own!.id} initial={own!.needLevel} />
          </div>
        </SettingsCard>
        <SettingsCard title="Opening times">
          <RetrievalHoursEditor dropOffId={own!.id} initialHours={own!.retrievalHours} />
        </SettingsCard>
        {myDropOffId && (
          <TeamPanel
            members={members}
            invites={invites}
            title="Your team"
            description="Everyone here manages this drop-off together. Invite a teammate to add another account for this location."
            demo={demo}
          />
        )}
        <SettingsCard title="Special notices">
          <DropOffNotesEditor dropOffId={own!.id} initialNotes={own!.notes ?? ""} />
          <DropOffNoticeManager dropOffId={own!.id} initial={noticesByDropOff[own!.id] ?? []} />
        </SettingsCard>
      </div>
    </DropOffTabShell>
  );
}
