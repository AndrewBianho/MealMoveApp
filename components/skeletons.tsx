import { cn } from "./cn";

// Skeleton primitives for route-level loading states (App Router loading.tsx).
// Pure placeholder boxes — no literal text or icons — sized and positioned to
// echo each page's real layout, so nothing shifts when the data lands. The
// pulse is decorative and motion-safe only; screen readers get a single
// "Loading" status instead of a pile of empty boxes.

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-lg bg-neutral-200 motion-safe:animate-pulse", className)}
    />
  );
}

/**
 * A ListingCard with its data pending: same shell and photo panel, with boxes
 * where the status line, title, source, facts, chips, and action will land.
 */
export function ListingCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-row-reverse overflow-hidden rounded-3xl border border-neutral-200/70 bg-card shadow-card"
    >
      {/* Photo panel */}
      <SkeletonBlock className="w-28 shrink-0 self-stretch rounded-none sm:w-44 lg:w-[232px]" />
      <div className="flex min-w-0 flex-1 flex-col justify-center p-5 sm:p-6">
        {/* Urgency line */}
        <SkeletonBlock className="h-3 w-24" />
        {/* Title */}
        <SkeletonBlock className="mt-3 h-6 w-3/4" />
        {/* Source line */}
        <SkeletonBlock className="mt-2.5 h-3.5 w-36" />
        {/* Decision facts */}
        <SkeletonBlock className="mt-4 h-4 w-44" />
        {/* Category + handling chips */}
        <div className="mt-3 flex gap-1.5">
          <SkeletonBlock className="h-6 w-16 rounded-full" />
          <SkeletonBlock className="h-6 w-20 rounded-full" />
        </div>
        {/* Full-width action */}
        <SkeletonBlock className="mt-5 h-11 w-full rounded-2xl" />
      </div>
    </div>
  );
}

/** A MetricCard with its number pending: value + label boxes, centered. */
export function MetricCardSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-3xl bg-card p-6 text-center shadow-card">
      <SkeletonBlock className="mx-auto h-9 w-20" />
      <SkeletonBlock className="mx-auto mt-3 h-3 w-24" />
    </div>
  );
}

/** A feed filter pill awaiting its label + count. */
export function FilterPillSkeleton({ className }: { className?: string }) {
  return <SkeletonBlock className={cn("h-9 rounded-full", className ?? "w-20")} />;
}

/** The one accessible announcement per loading screen. */
export function LoadingStatus({ label }: { label: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}
