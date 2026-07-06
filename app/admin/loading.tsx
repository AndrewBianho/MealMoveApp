import { LoadingStatus, SkeletonBlock } from "@/components/skeletons";

// Shared loading state for the org-admin console pages (members, partners,
// health, reliability): header + stacked row/table boxes in the console shell.
export default function Loading() {
  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <LoadingStatus label="Loading admin console" />
      <header className="mb-6" aria-hidden="true">
        <SkeletonBlock className="h-10 w-64 max-w-full" />
        <SkeletonBlock className="mt-3 h-4 w-96 max-w-full" />
      </header>
      <div className="max-w-4xl space-y-4" aria-hidden="true">
        <SkeletonBlock className="h-16 rounded-xl" />
        <SkeletonBlock className="h-16 rounded-xl" />
        <SkeletonBlock className="h-16 rounded-xl" />
        <SkeletonBlock className="h-16 rounded-xl" />
        <SkeletonBlock className="h-16 rounded-xl" />
      </div>
    </main>
  );
}
