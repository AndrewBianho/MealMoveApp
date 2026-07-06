import { LoadingStatus, SkeletonBlock } from "@/components/skeletons";

// Drop-off console loading state: header, the inbound section, and the
// locations grid as placeholder boxes in the real console shell.
export default function Loading() {
  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <LoadingStatus label="Loading drop-off locations" />
      <header className="mb-6" aria-hidden="true">
        <SkeletonBlock className="h-10 w-80 max-w-full" />
        <SkeletonBlock className="mt-3 h-4 w-96 max-w-full" />
      </header>
      <div aria-hidden="true">
        <SkeletonBlock className="mb-8 h-40 max-w-md rounded-xl" />
        <SkeletonBlock className="mb-4 h-5 w-40" />
        <div className="mb-8 grid gap-4 md:grid-cols-2">
          <SkeletonBlock className="h-40 rounded-3xl" />
          <SkeletonBlock className="h-40 rounded-3xl" />
        </div>
        <SkeletonBlock className="mb-4 h-5 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <SkeletonBlock className="h-56 rounded-3xl" />
          <SkeletonBlock className="h-56 rounded-3xl" />
          <SkeletonBlock className="h-56 rounded-3xl" />
          <SkeletonBlock className="h-56 rounded-3xl" />
        </div>
      </div>
    </main>
  );
}
