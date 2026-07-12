import { auth } from "@/auth";
import { getDashboardData } from "@/lib/analytics/dashboardData";
import { MetricCard } from "@/components/MetricCard";

export const dynamic = "force-dynamic";

// A calm horizontal bar for the funnel — sage fill, width proportional to the
// claimed total, mono count so it reads without relying on color alone.
function FunnelBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm text-neutral-800">{label}</span>
        <span className="font-mono text-[13px] text-neutral-700">{count}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-rescued-400"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default async function AnalyticsPage() {
  await auth();
  const d = await getDashboardData();
  const completion = Math.round((1 - d.flakeRate) * 100);
  const total = d.funnel.claimed;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="font-display text-[34px] font-semibold leading-[1.1] tracking-tight text-balance">
          Analytics
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          Operational metrics for the chapter — how much food moves, and how
          reliably. Internal only.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="meals rescued" value={String(d.servingsRescued)} accent="rescued" />
        <MetricCard label="pickups delivered" value={String(d.funnel.delivered)} accent="clay" />
        <MetricCard label="completion rate" value={`${completion}%`} accent="transit" />
      </div>

      <section className="mt-8 rounded-3xl bg-card p-6 shadow-card">
        <h2 className="font-display text-lg font-semibold">Claim funnel</h2>
        <p className="mt-1 font-mono text-[11px] text-neutral-700">
          claimed &rarr; picked up &rarr; delivered
        </p>
        <div className="mt-5 space-y-4">
          <FunnelBar label="Claimed" count={d.funnel.claimed} total={total} />
          <FunnelBar label="Picked up" count={d.funnel.pickedUp} total={total} />
          <FunnelBar label="Delivered" count={d.funnel.delivered} total={total} />
        </div>
      </section>

      <section className="mt-4 rounded-3xl bg-card p-6 shadow-card">
        <h2 className="font-display text-lg font-semibold">Completion rate</h2>
        <p className="mt-1 font-mono text-[11px] text-neutral-700">
          share of claims that reached delivery, not a grade on anyone
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-rescued-400"
              style={{ width: `${completion}%` }}
            />
          </div>
          <span className="font-mono text-[13px] text-neutral-800">{completion}%</span>
        </div>
      </section>
    </main>
  );
}
