import { CountUp } from "./CountUp";
import { cn } from "./cn";
import { capitalize } from "@/lib/text";

// The earthy ramps a stat can wear. Color-codes the value + a soft corner glow
// so a grid of metrics reads with energy and a little wayfinding, instead of a
// row of identical white cards. Static class strings so Tailwind keeps them.
export type MetricAccent = "rescued" | "clay" | "transit" | "urgent";

const ACCENTS: Record<MetricAccent, { value: string; glow: string }> = {
  rescued: { value: "text-rescued-600", glow: "bg-rescued-200" },
  clay: { value: "text-clay-600", glow: "bg-clay-200" },
  transit: { value: "text-transit-600", glow: "bg-transit-200" },
  urgent: { value: "text-urgent-600", glow: "bg-urgent-200" },
};

// Stable hue per metric so the same number wears the same color on every screen
// (meals = sage, weight = clay, hours/driving = plum, …). Avoids honey/tomato
// for vanity counts so the status colors keep their urgency meaning.
const ACCENT_BY_LABEL: Record<string, MetricAccent> = {
  "meals rescued": "rescued",
  "meals received": "rescued",
  "lbs rescued": "clay",
  "lbs received": "clay",
  "lbs saved": "clay",
  "donations received": "rescued",
  "arrivals this week": "clay",
  "hours driven": "transit",
  "pickups this week": "clay",
  "pickups completed": "clay",
  "partner restaurants": "transit",
  "restaurants helped": "transit",
  "active volunteers": "rescued",
  "volunteers helped": "rescued",
  "drop-offs reached": "clay",
};

export function metricAccent(label: string): MetricAccent {
  return ACCENT_BY_LABEL[label] ?? "rescued";
}

// Impact stat: a big display-serif value that counts up, over a mono label.
// A soft accent glow gives it warmth and depth; the card lifts on hover and
// presses on tap for tactility.
export function MetricCard({
  label,
  value,
  accent = "rescued",
}: {
  label: string;
  value: string;
  accent?: MetricAccent;
}) {
  const a = ACCENTS[accent];
  return (
    <div className="group relative overflow-hidden rounded-3xl bg-card p-6 text-center shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift active:translate-y-0 active:scale-[0.99]">
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-50 blur-2xl transition-opacity duration-300 group-hover:opacity-80",
          a.glow
        )}
      />
      <div className={cn("relative font-display text-4xl font-semibold leading-none", a.value)}>
        <CountUp value={value} />
      </div>
      <div className="relative mt-2 font-mono text-[13px] text-neutral-700">
        {capitalize(label)}
      </div>
    </div>
  );
}
