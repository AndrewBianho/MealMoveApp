import { redirect } from "next/navigation";
import { DropOffConstraintsEditor } from "@/components/DropOffConstraintsEditor";
import { DropOffNotesEditor } from "@/components/DropOffNotesEditor";
import { DropOffNoticeManager } from "@/components/DropOffNoticeManager";
import { DropOffNotLinked, DropOffTabShell } from "@/components/DropOffTabShell";
import { NeedLevelControl } from "@/components/NeedLevelControl";
import { RetrievalHoursEditor } from "@/components/RetrievalHoursEditor";
import { OpenNowBadge } from "@/components/RetrievalHoursDisplay";
import { TeamPanel } from "@/components/TeamPanel";
import { loadDropOffConsole } from "@/lib/dropoffConsole";
import { parseStoredHours } from "@/lib/hours";

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

// The drop-off console's first tab — "About us" for a `drop_off` account:
// everything the location is in charge of (hours, team, what it accepts,
// notices); the other tabs (Conversations / Incoming / Impact) are their own
// routes. Org admins oversee the chapter elsewhere (analytics, members) and are
// redirected out of the drop-off console entirely.
export default async function DropoffPage() {
  const {
    isOrgAdmin,
    myDropOffId,
    own,
    demo,
    noticesByDropOff,
    members,
    invites,
  } = await loadDropOffConsole();

  // Org admins oversee the chapter, not any single location's console — send
  // them to their analytics home.
  if (isOrgAdmin) redirect("/admin/analytics");
  if (!own) return <DropOffNotLinked />;

  const ownHours = parseStoredHours(own.retrievalHours);

  return (
    <DropOffTabShell
      title={own!.name}
      // The same badge volunteers see against this location's name, shown to
      // the people who set the hours — so "are we currently listed as open"
      // is answered next to the name, not inferred from the editor below.
      badge={ownHours ? <OpenNowBadge hours={ownHours} /> : null}
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
