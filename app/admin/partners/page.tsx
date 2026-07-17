import { requireRole } from "@/lib/authz";
import { isDemo } from "@/lib/mode";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/orgNotes";
import { OrgNotesPanel } from "@/components/OrgNotesPanel";

export const dynamic = "force-dynamic";

// Org-admin relationship-memory view: contacts & quirks for every restaurant and
// drop-off — the human know-how that survives founder turnover. The /admin prefix
// is org-admin-gated in auth.config, so this page is org-admin only. Not shown to
// volunteers; edits are logged to the AdminEvent stream.
export default async function AdminPartnersPage() {
  await requireRole("org_admin");
  const demo = await isDemo();

  const notesSelect = {
    id: true,
    name: true,
    address: true,
    primaryContact: true,
    contactInfo: true,
    lastContactAt: true,
    quirks: true,
  } as const;

  const [restaurants, dropOffs] = await Promise.all([
    prisma.restaurant.findMany({ where: { demo }, orderBy: { name: "asc" }, select: notesSelect }),
    prisma.dropOff.findMany({ where: { demo }, orderBy: { name: "asc" }, select: notesSelect }),
  ]);

  type Row = (typeof restaurants)[number];
  const toValues = (r: Row) => ({
    primaryContact: r.primaryContact ?? "",
    contactInfo: r.contactInfo ?? "",
    lastContactDate: toDateInputValue(r.lastContactAt),
    quirks: r.quirks ?? "",
  });

  function Section({
    title,
    entity,
    rows,
  }: {
    title: string;
    entity: "restaurant" | "drop_off";
    rows: Row[];
  }) {
    return (
      <section className="mb-10">
        <h2 className="mb-3 text-2xl font-semibold">
          {title} <span className="font-mono text-sm text-neutral-700">{rows.length}</span>
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-neutral-700">None yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-3xl bg-card p-6 shadow-card">
                <h3 className="text-lg font-semibold">{r.name}</h3>
                <p className="font-mono text-[12px] text-neutral-700">{r.address}</p>
                <OrgNotesPanel entity={entity} id={r.id} initial={toValues(r)} />
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
          Partner notes
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          Who to call and what&apos;s quirky about each restaurant and drop-off — the
          relationship know-how that keeps running after this year&apos;s leaders graduate.
          Internal only; never shown to volunteers.
        </p>
      </header>

      <Section title="Restaurants" entity="restaurant" rows={restaurants} />
      <Section title="Drop-offs" entity="drop_off" rows={dropOffs} />
    </main>
  );
}
