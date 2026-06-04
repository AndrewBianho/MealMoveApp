// Impact stat. Mono label above a mono value, on a neutral-50 fill.
export function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-900/5 bg-white p-4 shadow-card">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
        {label}
      </div>
      <div className="font-display text-3xl font-semibold leading-none text-neutral-900">
        {value}
      </div>
    </div>
  );
}
