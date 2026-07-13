import { auth } from "@/auth";
import { getDataMode } from "@/lib/mode";
import { listAnnouncements } from "@/lib/announcements";
import { AnnouncementComposer } from "@/components/AnnouncementComposer";

// /admin is org-admin-gated at the route level (auth.config), so this page is
// org-admin only. Compact console scale.
export const dynamic = "force-dynamic";

export default async function AdminUpdatesPage() {
  await auth();
  const world = await getDataMode();
  const sent = await listAnnouncements(world);

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
          Updates
        </h1>
        <p className="mt-1 text-sm text-neutral-700">
          Send a note to every volunteer — a heads-up, a thank-you, a change of plan.
        </p>
      </header>

      <AnnouncementComposer />

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">Sent</h2>
        {sent.length === 0 ? (
          <p className="text-sm text-neutral-700">No updates sent yet.</p>
        ) : (
          <ul className="space-y-3">
            {sent.map((a) => (
              <li
                key={a.id}
                className="rounded-2xl border border-neutral-900/5 bg-card p-5 shadow-card"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold text-neutral-900">
                    {a.title}
                  </h3>
                  <span className="shrink-0 font-mono text-[11px] text-neutral-700">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-neutral-700">{a.body}</p>
                <p className="mt-2 font-mono text-[11px] text-neutral-700">
                  Reached {a.recipientCount}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
