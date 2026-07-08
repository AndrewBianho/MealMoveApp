import {
  FilterPillSkeleton,
  ListingCardSkeleton,
  LoadingStatus,
  SkeletonBlock,
} from "@/components/skeletons";

// Feed loading state: header, filter pills, and a stack of card placeholders
// in the same shell as the real page, so the swap to live data doesn't shift
// the layout. Boxes only — the real text arrives with the data.
export default function Loading() {
  return (
    <main className="mx-auto max-w-[720px] px-6 py-10 sm:px-8 lg:max-w-[1200px]">
      <LoadingStatus label="Loading pickups" />
      <header className="mb-7 lg:max-w-2xl" aria-hidden="true">
        <SkeletonBlock className="h-9 w-64 max-w-full" />
        <SkeletonBlock className="mt-3 h-4 w-80 max-w-full" />
      </header>
      <div
        className="mb-6 flex flex-wrap items-center justify-between gap-3"
        aria-hidden="true"
      >
        <FilterPillSkeleton className="w-36" />
        <FilterPillSkeleton className="w-56" />
      </div>
      <div className="flex flex-col gap-6 lg:max-w-2xl" aria-hidden="true">
        <ListingCardSkeleton />
        <ListingCardSkeleton />
        <ListingCardSkeleton />
      </div>
    </main>
  );
}
