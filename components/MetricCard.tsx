// Impact stat. Mono label above a mono value, on a neutral-50 fill.
export function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl bg-white p-6 text-center shadow-card transition-transform duration-200 hover:-translate-y-1">
      <div className="font-display text-4xl font-semibold leading-none text-rescued-600">
        {value}
      </div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
        {label}
      </div>
    </div>
  );
}
