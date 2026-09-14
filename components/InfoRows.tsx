import { Fragment, type ReactNode } from "react";
import { cn } from "./cn";
import { capitalize } from "@/lib/text";

export interface InfoRow {
  /** Mono micro-label, authored lower-case; rendered sentence case. */
  label: string;
  value: ReactNode;
  /** Leading glyph for the value (handling, allergens). Passed separately, not
   *  baked into `value`, so it sits in its own reserved slot and the value text
   *  starts at the same x on every row. */
  icon?: ReactNode;
}

/**
 * A calm definition list: a mono micro-label beside its value.
 * The app-wide way to lay out listing metadata — food type, handling, cars,
 * allergens, drop-off.
 *
 * Alignment is the whole job here, and it comes from a two-column grid whose
 * label track is `max-content`: the column sizes itself to the longest label in
 * the list, so values line up exactly without anyone guessing a rem width (a
 * fixed 4.5rem left "Food" stranded from its value and pinched "Handling").
 * Rows are separated by space rather than hairlines — two rules inside an
 * already-bordered card read as a broken table, not a list.
 */
export function InfoRows({
  rows,
  className,
}: {
  rows: InfoRow[];
  className?: string;
}) {
  // One row with an icon reserves the slot on every row, so a value with no
  // glyph still starts where the others do.
  const hasIcon = rows.some((r) => r.icon);
  return (
    <dl
      className={cn(
        // Two aligned columns wherever there's room. Under 360px the value
        // track drops below ~64px and a one-word value ("Prepared") has no
        // wrap opportunity, so it spills past the card; there the label sits
        // above its value instead.
        "grid grid-cols-1 items-baseline gap-y-2",
        "min-[360px]:grid-cols-[max-content_minmax(0,1fr)] min-[360px]:gap-x-4 min-[360px]:gap-y-1.5",
        className
      )}
    >
      {rows.map((r) => (
        <Fragment key={r.label}>
          <dt className="font-mono text-[13px] leading-5 text-neutral-700">
            {capitalize(r.label)}
          </dt>
          <dd className="min-w-0 break-words text-[15px] font-medium leading-5 text-neutral-800">
            {hasIcon ? (
              <span className="flex items-baseline gap-1.5">
                <span
                  aria-hidden
                  className="w-[1.05em] shrink-0 self-center text-neutral-700"
                >
                  {r.icon}
                </span>
                <span className="min-w-0">{r.value}</span>
              </span>
            ) : (
              r.value
            )}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}
