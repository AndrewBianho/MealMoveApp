import { Fragment, type ReactNode } from "react";
import { cn } from "./cn";
import { capitalize } from "@/lib/text";

export interface InfoRow {
  /** Mono micro-label, authored lower-case; rendered sentence case. */
  label: string;
  value: ReactNode;
}

/**
 * Listing metadata as a small table: a mono label column, a value column, and
 * a hairline between rows.
 *
 * Both columns come from one grid whose label track is `max-content`, so the
 * column sizes itself to the longest label in this particular list and every
 * value starts on the same line. The rule is drawn as a border on the cells
 * rather than the row, and the columns are separated by the label's own
 * padding rather than a grid gap, so the two borders meet and the line runs
 * unbroken across the table.
 */
export function InfoRows({
  rows,
  className,
}: {
  rows: InfoRow[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-[max-content_minmax(0,1fr)] items-baseline",
        className
      )}
    >
      {rows.map((r, i) => {
        // Rules sit between rows, never above the first or below the last.
        const rule = i > 0 ? "border-t border-neutral-200/70" : "";
        return (
          <Fragment key={r.label}>
            <dt
              className={cn(
                // Tighter label on the narrowest phones: at 320px the card's
                // text column is ~144px, and a 13px label plus a 20px gutter
                // left too little for a one-word value, which then broke
                // mid-word.
                "py-2 pr-3 font-mono text-[12px] leading-5 text-neutral-700",
                "min-[400px]:pr-5 min-[400px]:text-[13px]",
                rule
              )}
            >
              {capitalize(r.label)}
            </dt>
            <dd
              className={cn(
                "min-w-0 break-words py-2 text-[14px] font-medium leading-5 text-neutral-800",
                "min-[400px]:text-[15px]",
                rule
              )}
            >
              {r.value}
            </dd>
          </Fragment>
        );
      })}
    </dl>
  );
}
