import { MyPickups } from "@/components/MyPickups";
import { ReliabilityMeter } from "@/components/ReliabilityMeter";

export default function PickupsPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">My pickups</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Everything you&apos;ve claimed, in flight, or completed.
        </p>
      </header>

      <div className="mb-8 max-w-sm rounded-xl border border-neutral-200/40 bg-white p-5">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
          your reliability · last 30 days
        </p>
        <ReliabilityMeter name="On-time completion" pct={91} />
      </div>

      <MyPickups />
    </main>
  );
}
