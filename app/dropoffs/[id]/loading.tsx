import { LoadingStatus, SkeletonBlock } from "@/components/skeletons";

// Drop-off-detail loading state: header + the delivery card grids as
// placeholder boxes in the real page's shell.
export default function Loading() {
  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <LoadingStatus label="Loading drop-off" />
      <div aria-hidden="true">
        <SkeletonBlock className="mb-4 h-4 w-16" />
        <SkeletonBlock className="h-10 w-72 max-w-full" />
        <SkeletonBlock className="mt-3 h-4 w-96 max-w-full" />
        <SkeletonBlock className="mb-4 mt-8 h-5 w-40" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <SkeletonBlock className="h-64 rounded-3xl" />
          <SkeletonBlock className="h-64 rounded-3xl" />
          <SkeletonBlock className="h-64 rounded-3xl" />
          <SkeletonBlock className="h-64 rounded-3xl" />
        </div>
      </div>
    </main>
  );
}
