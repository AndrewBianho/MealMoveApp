import { cn } from "./cn";
import {
  DAY_KEYS,
  DAY_LABELS,
  formatDay,
  isOpenNow,
  type RetrievalHours,
} from "@/lib/hours";

// Open/closed status. Color-blind-safe: a dot + the literal label, never hue
// alone (sage = open, neutral = closed).
export function OpenNowBadge({ hours }: { hours: RetrievalHours | null }) {
  const open = isOpenNow(hours);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[13px]",
        open ? "bg-rescued-50 text-rescued-800" : "bg-neutral-100 text-neutral-700"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          open ? "bg-rescued-600" : "bg-neutral-400"
        )}
      />
      {open ? "open now" : "closed"}
    </span>
  );
}

// Read-only weekly hours table + the open-now badge. Reused on the drop-off
// console, the drop-off detail page, and (the badge) the listing detail.
export function RetrievalHoursDisplay({ hours }: { hours: RetrievalHours | null }) {
  if (!hours) {
    return (
      <p className="text-[13px] italic text-neutral-700">Retrieval hours not set yet.</p>
    );
  }
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <p className="font-mono text-[13px] text-neutral-700">
          Retrieval hours
        </p>
        <OpenNowBadge hours={hours} />
      </div>
      <ul className="space-y-0.5">
        {DAY_KEYS.map((d) => (
          <li key={d} className="flex justify-between gap-4 font-mono text-[13px]">
            <span className="text-neutral-700">{DAY_LABELS[d]}</span>
            <span className="text-neutral-700">{formatDay(hours[d])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
