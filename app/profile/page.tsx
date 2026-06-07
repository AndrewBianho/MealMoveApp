import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/Avatar";
import { MetricCard } from "@/components/MetricCard";
import { ReliabilityMeter } from "@/components/ReliabilityMeter";
import { getVolunteerImpact } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, role: true, createdAt: true },
  });
  if (!user) redirect("/login");

  const impact = await getVolunteerImpact(userId);
  const hasActivity = impact.pickupsCompleted > 0 || impact.attempts > 0;
  const joined = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(user.createdAt);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 flex items-center gap-4">
        <Avatar name={user.name} size="lg" className="shadow-card" />
        <div>
          <h1 className="font-display text-[32px] font-medium leading-tight">
            {user.name}
          </h1>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-neutral-600">
            {user.role.replace(/_/g, " ")} · joined {joined}
          </p>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
          lifetime impact
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard
            label="meals rescued"
            value={impact.mealsRescued.toLocaleString()}
          />
          <MetricCard
            label="lbs saved"
            value={impact.lbsSaved.toLocaleString()}
          />
          <MetricCard
            label="pickups completed"
            value={impact.pickupsCompleted.toLocaleString()}
          />
          <MetricCard
            label="restaurants helped"
            value={impact.restaurantsHelped.toLocaleString()}
          />
        </div>
      </section>

      <section className="mb-8 max-w-sm rounded-2xl bg-white p-5 shadow-card">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
          your completion rate · lifetime
        </p>
        <ReliabilityMeter name="On-time completion" pct={impact.completionRate} />
      </section>

      {!hasActivity && (
        <p className="text-sm text-neutral-600">
          Your first rescue is waiting —{" "}
          <Link
            href="/"
            className="font-semibold text-clay-600 underline-offset-2 hover:underline"
          >
            claim a pickup
          </Link>{" "}
          and your impact shows up here.
        </p>
      )}
    </main>
  );
}
