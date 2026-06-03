import { cn } from "./cn";

// Non-punitive by design: a bar and a percentage, never a letter grade or a
// public ranking. Color keys off the same thresholds for fill and text.
function tier(pct: number): "high" | "mid" | "low" {
  if (pct >= 80) return "high";
  if (pct >= 50) return "mid";
  return "low";
}

const FILL = {
  high: "bg-rescued-400",
  mid: "bg-urgent-400",
  low: "bg-failed-400",
} as const;

const TEXT = {
  high: "text-rescued-600",
  mid: "text-urgent-600",
  low: "text-failed-600",
} as const;

export function ReliabilityMeter({
  name,
  pct,
}: {
  name: string;
  pct: number;
}) {
  const t = tier(pct);
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm">{name}</span>
        <span className={cn("font-mono text-sm font-medium", TEXT[t])}>
          {clamped}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={cn("h-full rounded-full", FILL[t])}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
