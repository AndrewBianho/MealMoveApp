// Impact stat. Mono label above a mono value, on a neutral-50 fill.
export function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-neutral-50 p-4">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
        {label}
      </div>
      <div className="font-mono text-2xl font-medium">{value}</div>
    </div>
  );
}
