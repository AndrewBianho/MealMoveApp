import { LoadingStatus, SkeletonBlock } from "@/components/skeletons";

// Listing-detail loading state: back cue, urgency strip, then the main card +
// 320px sidebar grid the real detail renders into — all placeholder boxes, so
// the claim surface appears in place.
export default function Loading() {
  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <LoadingStatus label="Loading pickup details" />
      <div aria-hidden="true">
        <SkeletonBlock className="mb-4 h-4 w-16" />
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="overflow-hidden rounded-2xl border border-neutral-200/40 bg-card">
            <div className="h-[3px] bg-neutral-200" />
            <div className="p-6">
              <SkeletonBlock className="h-8 w-2/3" />
              <SkeletonBlock className="mt-4 h-6 w-28 rounded-full" />
              <div className="mt-6 space-y-3">
                <SkeletonBlock className="h-4 w-52" />
                <SkeletonBlock className="h-4 w-40" />
                <SkeletonBlock className="h-4 w-52" />
                <SkeletonBlock className="h-4 w-40" />
              </div>
              <SkeletonBlock className="mt-6 h-12 w-full rounded-2xl sm:w-56" />
            </div>
          </div>
          <div className="space-y-6">
            <SkeletonBlock className="h-48 rounded-2xl" />
            <SkeletonBlock className="h-64 rounded-2xl" />
          </div>
        </div>
      </div>
    </main>
  );
}
