import { LoadingStatus, SkeletonBlock } from "@/components/skeletons";

// Post-surplus hub loading state: header plus the two card columns (post +
// photo on the left, schedules + team on the right) as placeholder boxes.
export default function Loading() {
  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <LoadingStatus label="Loading the posting page" />
      <header className="mb-6" aria-hidden="true">
        <SkeletonBlock className="h-10 w-80 max-w-full" />
        <SkeletonBlock className="mt-3 h-4 w-96 max-w-full" />
      </header>
      <div className="grid max-w-4xl items-start gap-4 lg:grid-cols-2 lg:gap-6" aria-hidden="true">
        <div className="space-y-4">
          <SkeletonBlock className="h-56 rounded-xl" />
          <SkeletonBlock className="h-48 rounded-xl" />
        </div>
        <div className="space-y-4">
          <SkeletonBlock className="h-72 rounded-xl" />
          <SkeletonBlock className="h-48 rounded-xl" />
        </div>
      </div>
    </main>
  );
}
