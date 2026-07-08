import { cn } from "./cn";
import { Clock } from "./icons";
import { capitalize } from "@/lib/text";

// Key for the card countdown chip: one soft tinted chip per band (ramp-50 fill +
// ramp-800 text — the project's status-badge pattern), each pairing the hue with
// the clock icon, a word, and the literal minute range, so it reads without color
// perception (color-blind-safe). Ordered calm → urgent. Bands match
// ListingCard.urgency(): open (35m+) · soon (<35) · closing soon (<10) · closed.
const ITEMS: { label: string; range: string; fill: string; clock?: boolean }[] = [
  { label: "open", range: "35m +", fill: "bg-rescued-50 text-rescued-800", clock: true },
  { label: "soon", range: "10–35m", fill: "bg-urgent-50 text-urgent-800", clock: true },
  { label: "closing soon", range: "< 10m", fill: "bg-failed-50 text-failed-800", clock: true },
  { label: "closed", range: "Claimed / expired", fill: "bg-neutral-100 text-neutral-700" },
];

export function UrgencyLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      aria-label="What the card countdown colors mean"
    >
      <span className="mr-0.5 font-mono text-[13px] text-neutral-700">
        Time left
      </span>
      {ITEMS.map((i) => (
        <span
          key={i.label}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[13px]",
            i.fill
          )}
        >
          {i.clock ? (
            <Clock className="text-[0.95em]" />
          ) : (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-400" aria-hidden="true" />
          )}
          <span className="font-semibold">{capitalize(i.label)}</span>
          <span className="tabular-nums opacity-80">{i.range}</span>
        </span>
      ))}
    </div>
  );
}
