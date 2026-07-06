import { LoadingStatus, SkeletonBlock } from "@/components/skeletons";

// Map loading state: one full-viewport box where the map will land, in the
// same shell as the real page (accounting for the header and mobile tab bar).
export default function Loading() {
  return (
    <main className="relative h-[calc(100dvh_-_4rem_-_4.5rem)] w-full overflow-hidden md:h-[calc(100dvh_-_4rem)]">
      <LoadingStatus label="Loading map" />
      <SkeletonBlock className="h-full w-full rounded-none" />
    </main>
  );
}
