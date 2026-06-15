import { CountUp } from "./CountUp";

// Impact stat: a big display-serif value that counts up, over a mono label.
// The card lifts on hover for a little tactility.
export function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl bg-card p-6 text-center shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift">
      <div className="font-display text-4xl font-semibold leading-none text-rescued-600">
        <CountUp value={value} />
      </div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
        {label}
      </div>
    </div>
  );
}
