import { cn } from "./cn";
import {
  currentDayKey,
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

/**
 * A drop-off's name with its open/closed state attached. Wherever someone reads
 * a destination they should also read whether it can take food right now — the
 * two facts answer one question, so they travel together instead of being
 * separated by a panel or a page.
 *
 * Renders the bare name when the location has no hours on file. `isOpenNow`
 * treats "unknown" as `false`, so an unguarded badge would tell a volunteer a
 * drop-off is *closed* when the truth is that nobody has filled its hours in —
 * a claim worth withholding, especially now the badge appears app-wide.
 *
 * Wraps as a unit: the badge follows the name on the same line and drops
 * beneath it when the column is too narrow, rather than splitting the name.
 */
export function DropOffName({
  name,
  hours,
  className,
}: {
  name: React.ReactNode;
  hours: RetrievalHours | null | undefined;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5",
        className
      )}
    >
      <span>{name}</span>
      {hours && <OpenNowBadge hours={hours} />}
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
        {DAY_KEYS.map((d) => {
          const today = d === currentDayKey();
          const closed = hours[d].length === 0;
          return (
            <li key={d} className="flex justify-between gap-4 font-mono text-[13px]">
              <span
                className={cn(
                  "flex items-center gap-1.5",
                  today ? "font-semibold text-neutral-900" : "text-neutral-700"
                )}
              >
                {DAY_LABELS[d]}
                {today && (
                  <span className="rounded-full bg-rescued-50 px-1.5 py-px text-[10px] font-medium text-rescued-800">
                    Today
                  </span>
                )}
              </span>
              <span
                className={cn(
                  closed
                    ? "text-neutral-700"
                    : today
                      ? "text-neutral-900"
                      : "text-neutral-700"
                )}
              >
                {formatDay(hours[d])}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
