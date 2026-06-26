import type { AccuracyAggregate } from "@/lib/accuracy";

// A calm, private read-out of the rescue-accuracy signals a restaurant has
// received — "were pickups there and as described?". Non-punitive by design:
// a bar + percentage and plain counts, never a grade or a red flag. Mirrors the
// volunteer reliability meter so the two sides feel symmetrical. Color-blind-
// safe: every figure is labelled, never carried by hue alone.

// Three calm bands for the "as described" rate — same thresholds as the
// volunteer reliability meter (sage ≥80, honey 50–79, otherwise tomato), but
// the framing stays operational, not a judgement of the restaurant.
function band(pct: number): string {
  if (pct >= 80) return "bg-rescued-400";
  if (pct >= 50) return "bg-urgent-400";
  return "bg-failed-400";
}

export function RestaurantAccuracySummary({
  data,
  className,
}: {
  data: AccuracyAggregate;
  className?: string;
}) {
  return (
    <section
      className={className}
      aria-label="Rescue accuracy"
    >
      <p className="font-mono text-[10px] uppercase tracking-wide text-neutral-700">
        Rescue accuracy · private
      </p>

      {data.total === 0 ? (
        <p className="mt-1 text-sm text-neutral-700">
          No volunteer signals yet — this fills in as pickups complete.
        </p>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-semibold text-rescued-600">
              {data.accuratePct}%
            </span>
            <span className="text-sm text-neutral-700">
              as described
            </span>
          </div>

          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-100"
            role="img"
            aria-label={`${data.accuratePct}% of pickups reported as described`}
          >
            <div
              className={`h-full rounded-full ${band(data.accuratePct ?? 0)}`}
              style={{ width: `${data.accuratePct}%` }}
            />
          </div>

          <dl className="mt-3 grid grid-cols-3 gap-2 font-mono text-[12px]">
            <div>
              <dt className="text-neutral-600">as described</dt>
              <dd className="text-neutral-900">{data.yes}</dd>
            </div>
            <div>
              <dt className="text-neutral-600">partly off</dt>
              <dd className="text-neutral-900">{data.partly}</dd>
            </div>
            <div>
              <dt className="text-neutral-600">not there</dt>
              <dd className="text-neutral-900">{data.no}</dd>
            </div>
          </dl>
          <p className="mt-2 font-mono text-[11px] text-neutral-600">
            {data.total} signal{data.total === 1 ? "" : "s"}
          </p>
        </>
      )}
    </section>
  );
}
