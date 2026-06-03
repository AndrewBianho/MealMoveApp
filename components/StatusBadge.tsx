import { cn } from "./cn";
import type { ListingStatus } from "@/lib/types";

export type { ListingStatus };

// Each fill + text pair is drawn from a single ramp (text uses 800 of the same
// ramp), per DESIGN.md. expired is intentionally neutral, not red.
const STYLES: Record<ListingStatus, string> = {
  open: "bg-rescued-50 text-rescued-800",
  claimed: "bg-urgent-50 text-urgent-800",
  "in transit": "bg-transit-50 text-transit-800",
  delivered: "bg-rescued-100 text-rescued-800",
  expired: "bg-neutral-50 text-neutral-800",
  failed: "bg-failed-50 text-failed-800",
};

export function StatusBadge({ status }: { status: ListingStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-0.5",
        "font-mono text-xs font-medium uppercase tracking-wide",
        STYLES[status]
      )}
    >
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      {status}
    </span>
  );
}
