"use client";

import { cn } from "./cn";
import { capitalize } from "@/lib/text";
import type { Listing } from "@/lib/types";

// The shared status-filter dropdown for card lists. One control, every
// console: the feed, my pickups, the restaurant console, and the drop-off
// console all filter their cards through this, so filtering reads the same on
// every account type. A native <select> keeps it a real form control —
// keyboard, screen-reader, and mobile picker behavior for free — dressed in
// the nav-pill recipe with a mono label, like the sort control beside it.

export interface StatusFilterOption {
  value: string;
  /** Sentence-case label; the count renders after it. */
  label: string;
  count: number;
}

export function StatusFilterSelect({
  value,
  options,
  onChange,
  selectLabel = "Filter listings",
  className,
}: {
  value: string;
  options: StatusFilterOption[];
  onChange: (value: string) => void;
  /** Accessible name for the select itself. */
  selectLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center", className)}>
      <span className="relative inline-flex">
        <select
          value={value}
          aria-label={selectLabel}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "appearance-none rounded-full border border-neutral-200 bg-card py-2 pl-4 pr-9 text-[15px] font-semibold text-neutral-800",
            "transition-colors duration-150 hover:border-neutral-300 hover:shadow-card",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50"
          )}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {capitalize(o.label)} · {o.count}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-700"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </div>
  );
}

/**
 * Build the option list from the cards actually present: "all" plus each
 * status that occurs, in the given canonical order, each with its count — so
 * the dropdown never offers a filter that would show an empty page.
 */
export function statusOptionsFrom(
  listings: Pick<Listing, "status">[],
  order: string[]
): StatusFilterOption[] {
  const counts = new Map<string, number>();
  for (const l of listings) {
    counts.set(l.status, (counts.get(l.status) ?? 0) + 1);
  }
  return [
    { value: "all", label: "all", count: listings.length },
    ...order
      .filter((s) => counts.has(s))
      .map((s) => ({ value: s, label: s, count: counts.get(s)! })),
  ];
}
