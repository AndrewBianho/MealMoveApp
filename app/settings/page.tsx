import { ThemeToggle } from "@/components/ThemeToggle";
import { DataModeToggle } from "@/components/DataModeToggle";
import { NotificationsToggle } from "@/components/NotificationsToggle";
import { getDataMode } from "@/lib/mode";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Settings · Meal Move" };

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const mode = await getDataMode();

  const session = await auth();
  const me = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { notificationsEnabled: true },
      })
    : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">Settings</h1>
        <p className="mt-1 text-sm text-neutral-700">
          Make Meal Move look the way you like.
        </p>
      </header>

      <section className="rounded-2xl border border-neutral-900/5 bg-card p-5 shadow-card">
        <h2 className="text-lg font-medium">Appearance</h2>
        <p className="mt-1 text-sm text-neutral-700">
          Light is Arctic Blue; dark is Deep Forest. System follows your device.
        </p>
        <div className="mt-4">
          <ThemeToggle />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-neutral-900/5 bg-card p-5 shadow-card">
        <h2 className="text-lg font-medium">Notifications</h2>
        <p className="mt-1 text-sm text-neutral-700">
          Get a gentle nudge when it&apos;s time to check in on a pickup, when
          someone invites you to buddy a rescue, or when a delivery is inbound.
          We&apos;ll use push where your device supports it, and email otherwise.
        </p>
        <div className="mt-4">
          <NotificationsToggle initialEnabled={me?.notificationsEnabled ?? false} />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-neutral-900/5 bg-card p-5 shadow-card">
        <h2 className="text-lg font-medium">Data</h2>
        <p className="mt-1 text-sm text-neutral-700">
          Demo shows a sample of rescues so you can explore how everything works.
          Real shows your chapter&apos;s live listings and locations. You can
          claim, post, and deliver in either — they stay separate.
        </p>
        <div className="mt-4">
          <DataModeToggle current={mode} />
        </div>
      </section>
    </main>
  );
}
