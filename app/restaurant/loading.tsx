import {
  ListingCardSkeleton,
  LoadingStatus,
  SkeletonBlock,
} from "@/components/skeletons";

// Restaurant-console loading state: header, the post/team side cards, and the
// listings stack as placeholder boxes in the real console shell.
export default function Loading() {
  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <LoadingStatus label="Loading your restaurant console" />
      <header className="mb-6" aria-hidden="true">
        <SkeletonBlock className="h-10 w-80 max-w-full" />
        <SkeletonBlock className="mt-3 h-4 w-96 max-w-full" />
      </header>
      <div className="grid gap-8 lg:grid-cols-[1fr_400px]" aria-hidden="true">
        <div className="flex max-w-3xl flex-col gap-[18px]">
          <ListingCardSkeleton />
          <ListingCardSkeleton />
        </div>
        <div className="space-y-6">
          <SkeletonBlock className="h-56 max-w-md rounded-3xl" />
          <SkeletonBlock className="h-72 max-w-md rounded-xl" />
        </div>
      </div>
    </main>
  );
}
