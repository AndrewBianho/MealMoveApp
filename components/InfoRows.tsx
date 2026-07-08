import type { ReactNode } from "react";
import { cn } from "./cn";

export interface InfoRow {
  /** Mono micro-label (sentence/lower-case; rendered uppercase). */
  label: string;
  value: ReactNode;
}

/**
 * A calm definition list: a mono micro-label beside its value, hairline-divided.
 * The app-wide way to lay out listing metadata — food type, handling, cars,
 * allergens, drop-off — replacing the old row of mini-pill chips. The label
 * column is fixed-width so the values align into a clean second column.
 */
export function InfoRows({
  rows,
  className,
  labelClassName,
}: {
  rows: InfoRow[];
  className?: string;
  /** Override the label column width, e.g. a wider column on the detail page. */
  labelClassName?: string;
}) {
  return (
    <dl className={cn("divide-y divide-neutral-200/60", className)}>
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline gap-3 py-2">
          <dt
            className={cn(
              "shrink-0 font-mono text-[10px] uppercase tracking-wide text-neutral-500",
              labelClassName ?? "w-[4.5rem]"
            )}
          >
            {r.label}
          </dt>
          <dd className="min-w-0 flex-1 text-[13px] font-medium text-neutral-800">
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
