import { cn } from "./cn";
import { capitalize } from "@/lib/text";
import type { ListingStatus } from "@/lib/types";

export type { ListingStatus };

// Just the mono label in the status color — no filled pill, no dot — so the
// status reads cleanly and quietly. Sentence case (never ALLCAPS). Text uses 800
// of each ramp; expired is intentionally neutral, not red. Color is never the
// sole signal: the word itself names the status (color-blind-safe without hue).
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
        "font-mono text-[13px] font-semibold",
        STYLES[status]
      )}
    >
      {capitalize(status)}
    </span>
  );
}
