import { LoadingStatus, SkeletonBlock } from "@/components/skeletons";

// Post-surplus hub loading state: header plus the three card columns (post +
// photo, recurring schedules, team) as placeholder boxes.
export default function Loading() {
  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <LoadingStatus label="Loading the posting page" />
      <header className="mb-6" aria-hidden="true">
        <SkeletonBlock className="h-10 w-80 max-w-full" />
        <SkeletonBlock className="mt-3 h-4 w-96 max-w-full" />
      </header>
      <div
        className="grid items-start gap-4 lg:grid-cols-2 lg:gap-6 xl:grid-cols-3"
        aria-hidden="true"
      >
        <div className="space-y-4">
          <SkeletonBlock className="h-56 rounded-xl" />
          <SkeletonBlock className="h-48 rounded-xl" />
        </div>
        <SkeletonBlock className="h-72 rounded-xl" />
        <SkeletonBlock className="h-48 rounded-xl" />
      </div>
    </main>
  );
}
