import {
  ListingCardSkeleton,
  LoadingStatus,
  SkeletonBlock,
} from "@/components/skeletons";

// Listings-page loading state: header, the status filter, and the card grid
// as placeholder boxes in the real page shell.
export default function Loading() {
  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <LoadingStatus label="Loading your listings" />
      <header className="mb-6" aria-hidden="true">
        <SkeletonBlock className="h-10 w-80 max-w-full" />
        <SkeletonBlock className="mt-3 h-4 w-96 max-w-full" />
      </header>
      <div aria-hidden="true">
        <SkeletonBlock className="mb-5 h-9 w-44 rounded-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          <ListingCardSkeleton />
          <ListingCardSkeleton />
          <ListingCardSkeleton />
          <ListingCardSkeleton />
        </div>
      </div>
    </main>
  );
}
