import { DataModeToggle } from "@/components/DataModeToggle";
import { NotificationsToggle } from "@/components/NotificationsToggle";
import { QuietHoursControl } from "@/components/QuietHoursControl";
import { WalkthroughSection } from "@/components/tour/WalkthroughSection";
import { getDataMode } from "@/lib/mode";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Settings · Meal Move" };

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const viewer = await requireUser();
  const mode = await getDataMode();

  const me = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: {
      notificationsEnabled: true,
      quietHoursStart: true,
      quietHoursEnd: true,
      demo: true,
    },
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">Settings</h1>
        <p className="mt-1 text-sm text-neutral-700">
          Make Meal Move look the way you like.
        </p>
      </header>

      <section className="rounded-2xl border border-neutral-900/5 bg-card p-5 shadow-card">
        <h2 className="text-lg font-medium">Notifications</h2>
        <div className="mt-4">
          <NotificationsToggle initialEnabled={me?.notificationsEnabled ?? false} />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-neutral-900/5 bg-card p-5 shadow-card">
        <h2 className="text-lg font-medium">Quiet hours</h2>
        <div className="mt-4">
          <QuietHoursControl
            initialStart={me?.quietHoursStart ?? null}
            initialEnd={me?.quietHoursEnd ?? null}
          />
        </div>
      </section>

      <WalkthroughSection userId={viewer.id} role={viewer.role} />

      <section className="mt-6 rounded-2xl border border-neutral-900/5 bg-card p-5 shadow-card">
        <h2 className="text-lg font-medium">Data</h2>
        {me?.demo ? (
          <>
            <p className="mt-1 text-sm text-neutral-700">
              You&apos;re exploring the demo world — a sample of rescues to try
              things out. Demo accounts stay in the demo world.
            </p>
            <p className="mt-3 inline-flex items-center rounded-full bg-neutral-100 px-4 py-1.5 font-mono text-[13px] text-neutral-700">
              Demo
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-neutral-700">
              Demo shows a sample of rescues so you can explore how everything
              works. Real shows your chapter&apos;s live listings and locations.
              You can claim, post, and deliver in either — they stay separate.
            </p>
            <div className="mt-4">
              <DataModeToggle current={mode} />
            </div>
          </>
        )}
      </section>
    </main>
  );
}
