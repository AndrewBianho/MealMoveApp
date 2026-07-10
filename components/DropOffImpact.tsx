import { MetricCard, metricAccent } from "./MetricCard";
import { EmptyState } from "./EmptyState";
import type { DropOffDonation, ImpactStat } from "@/lib/types";

// A drop-off's own impact: the lifetime numbers this location has helped move,
// then the record of past donations behind them. Stats wear the shared
// MetricCard (display-serif value + semantic accent); the record is a calm,
// hairline-divided list of mono metadata — not a nested card.
export function DropOffImpact({
  stats,
  donations,
}: {
  stats: ImpactStat[];
  donations: DropOffDonation[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <MetricCard
            key={s.label}
            label={s.label}
            value={s.value}
            accent={metricAccent(s.label)}
          />
        ))}
      </div>

      <div>
        <h3 className="mb-1 text-base font-semibold text-neutral-800">
          Past donations
        </h3>
        <p className="mb-4 text-sm text-neutral-700">
          Every completed delivery this location has received.
        </p>
        {donations.length > 0 ? (
          <ul className="divide-y divide-neutral-200/60 rounded-2xl border border-neutral-200/40 bg-card px-5 shadow-card sm:px-6">
            {donations.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-neutral-800">{d.title}</p>
                  <p className="font-mono text-[13px] text-neutral-700">
                    from {d.source}
                    {d.volunteer ? ` · via ${d.volunteer}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[13px] text-neutral-800">
                    <span className="font-semibold">{d.servings}</span> servings
                  </p>
                  <p className="font-mono text-[13px] text-neutral-700">
                    {formatWhen(d.deliveredAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            }
            title="No donations yet"
            hint="Once food is delivered here, every completed drop-off is recorded on this page."
          />
        )}
      </div>
    </div>
  );
}

// A pure-data date token (kept as written, per the mono-metadata rule) — the
// calendar day the food arrived, e.g. "Jul 9".
function formatWhen(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
