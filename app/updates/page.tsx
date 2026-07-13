import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getDataMode } from "@/lib/mode";
import { listAnnouncements } from "@/lib/announcements";
import { MarkSeenOnView } from "@/components/MarkSeenOnView";

export const dynamic = "force-dynamic";

// The volunteer's durable record of chapter updates. Comfortable scale.
export default async function UpdatesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const world = await getDataMode();
  const updates = await listAnnouncements(world);

  return (
    <main className="mx-auto max-w-[720px] px-6 py-8">
      <MarkSeenOnView />
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
          Updates
        </h1>
        <p className="mt-1 text-[16px] text-neutral-700">
          Notes from your chapter&apos;s organizers.
        </p>
      </header>

      {updates.length === 0 ? (
        <p className="text-[16px] text-neutral-700">
          No updates yet — you&apos;re all caught up.
        </p>
      ) : (
        <ul className="space-y-[18px]">
          {updates.map((a) => (
            <li key={a.id} className="rounded-3xl bg-card p-6 shadow-card">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[24px] font-medium leading-[1.18] tracking-tight text-neutral-900">
                  {a.title}
                </h2>
                <span className="shrink-0 font-mono text-[13px] text-neutral-700">
                  {new Date(a.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-line text-[16px] leading-relaxed text-neutral-800">
                {a.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
