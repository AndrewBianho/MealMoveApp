import { MetricCard } from "@/components/MetricCard";
import { ReliabilityMeter } from "@/components/ReliabilityMeter";
import { IMPACT_STATS, VOLUNTEERS } from "@/lib/mock";

export default function ImpactPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">Impact</h1>
        <p className="mt-1 text-sm text-neutral-600">
          What the chapter has rescued, and who keeps it running.
        </p>
      </header>

      <div className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-4">
        {IMPACT_STATS.map((s) => (
          <MetricCard key={s.label} label={s.label} value={s.value} />
        ))}
      </div>

      <section>
        <h2 className="mb-1 text-lg font-medium">Volunteer reliability</h2>
        <p className="mb-4 text-sm text-neutral-600">
          A bar and a percentage — never a grade. We surface who needs support,
          not who to shame.
        </p>
        <div className="max-w-xl space-y-4 rounded-xl border border-neutral-200/40 bg-white p-5">
          {VOLUNTEERS.map((v) => (
            <div key={v.id}>
              <ReliabilityMeter name={v.name} pct={v.reliability} />
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-neutral-400">
                {v.pickups} pickups
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
