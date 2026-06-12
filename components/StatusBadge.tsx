import { cn } from "./cn";
import type { ListingStatus } from "@/lib/types";

export type { ListingStatus };

// Color carries through the label text + the leading dot, with no filled pill,
// so the status reads cleanly without a boxy background. Text uses 800 of each
// ramp; expired is intentionally neutral, not red. Color is never the sole
// signal — the uppercase label and dot pair with it (color-blind-safe).
const STYLES: Record<ListingStatus, string> = {
  open: "text-rescued-800",
  claimed: "text-urgent-800",
  "in transit": "text-transit-800",
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
      <span className="h-[6px] w-[6px] rounded-full bg-current" />
      {status}
    </span>
  );
}
