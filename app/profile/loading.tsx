import {
  LoadingStatus,
  MetricCardSkeleton,
  SkeletonBlock,
} from "@/components/skeletons";

// Profile loading state: avatar + name header, the lifetime metric grid, and
// the completion card as placeholder boxes in the real page's shell.
export default function Loading() {
  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <LoadingStatus label="Loading your profile" />
      <header className="mb-8 flex items-center gap-4" aria-hidden="true">
        <SkeletonBlock className="h-16 w-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-10 w-64 max-w-full" />
          <SkeletonBlock className="mt-3 h-4 w-40 max-w-full" />
        </div>
      </header>
      <div
        className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5"
        aria-hidden="true"
      >
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
      </div>
      <SkeletonBlock className="h-40 max-w-sm rounded-2xl" />
    </main>
  );
}
