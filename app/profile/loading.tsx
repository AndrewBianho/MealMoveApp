import { LoadingStatus, SkeletonBlock } from "@/components/skeletons";

// Profile loading state: the page title, then the form card with a photo row
// and a stack of labelled fields as placeholder boxes — the real page's shell.
export default function Loading() {
  return (
    <main className="mx-auto max-w-xl px-6 py-8">
      <LoadingStatus label="Loading your profile" />
      <header className="mb-6" aria-hidden="true">
        <SkeletonBlock className="h-9 w-56 max-w-full" />
        <SkeletonBlock className="mt-3 h-4 w-72 max-w-full" />
      </header>
      <div
        className="space-y-6 rounded-2xl border border-neutral-900/5 bg-card p-6 shadow-card"
        aria-hidden="true"
      >
        <div className="flex items-center gap-4">
          <SkeletonBlock className="h-20 w-20 shrink-0 rounded-full" />
          <SkeletonBlock className="h-9 w-32" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i}>
            <SkeletonBlock className="mb-2 h-3.5 w-24" />
            <SkeletonBlock className="h-12 w-full rounded-md" />
          </div>
        ))}
        <SkeletonBlock className="h-12 w-40 rounded-2xl" />
      </div>
    </main>
  );
}
