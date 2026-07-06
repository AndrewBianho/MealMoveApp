import {
  LoadingStatus,
  MetricCardSkeleton,
  SkeletonBlock,
} from "@/components/skeletons";

// Impact-page loading state: the same header + two grouped metric grids as the
// real page, all as placeholder boxes, so the numbers land in place without a
// layout shift.
export default function Loading() {
  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <LoadingStatus label="Loading impact numbers" />
      <header className="mb-8" aria-hidden="true">
        <SkeletonBlock className="h-10 w-72 max-w-full" />
        <SkeletonBlock className="mt-3 h-4 w-96 max-w-full" />
      </header>
      <div className="max-w-4xl space-y-8" aria-hidden="true">
        {[0, 1].map((section) => (
          <section key={section}>
            <SkeletonBlock className="mb-3 h-3 w-24" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCardSkeleton />
              <MetricCardSkeleton />
              <MetricCardSkeleton />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
