import { cn } from "./cn";
import type { ListingStatus } from "@/lib/types";

export type { ListingStatus };

// Just the uppercase mono label in the status color — no filled pill, no dot —
// so the status reads cleanly and quietly. Text uses 800 of each ramp; expired
// is intentionally neutral, not red. Color is never the sole signal: the
// uppercase word itself names the status (color-blind-safe without the dot).
const STYLES: Record<ListingStatus, string> = {
  open: "text-rescued-800",
  claimed: "text-urgent-800",
  "in transit": "text-transit-800",
  "taken home": "text-transit-800",
  delivered: "text-rescued-800",
  expired: "text-neutral-800",
  failed: "text-failed-800",
};

export function StatusBadge({ status }: { status: ListingStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        "font-mono text-xs font-semibold uppercase tracking-wide",
        STYLES[status]
      )}
    >
      {status}
    </span>
  );
}
