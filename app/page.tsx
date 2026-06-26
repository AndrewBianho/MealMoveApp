import { ListingFeed } from "@/components/ListingFeed";
import { FirstRescueTracker } from "@/components/FirstRescueTracker";
import { getListings } from "@/lib/listings";
import { getVolunteerOnboarding } from "@/lib/onboarding";
import { auth } from "@/auth";

// Reads live data per request (and after revalidation from server actions).
export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const [listings, session] = await Promise.all([getListings(), auth()]);
  const canClaim = session?.user?.role !== "org_admin";

  // First-run activation: only volunteers see the first-rescue tracker, and only
  // until they complete their first rescue.
  const onboarding =
    session?.user?.role === "volunteer"
      ? await getVolunteerOnboarding(session.user.id)
      : null;

  // Meals claimable right now (open + live), for the sub-line.
  const openNow = listings.filter((l) => l.status === "open" && !l.scheduled).length;

  return (
    <main className="mx-auto max-w-[720px] px-6 py-10 sm:px-8">
      <header className="mb-7">
        <h1 className="font-display text-[36px] font-medium leading-[1.05] tracking-tight text-balance">
          Available pickups
        </h1>
        <p className="mt-2 text-[15px] font-medium text-neutral-600">
          {openNow > 0
            ? `${openNow} surplus ${openNow === 1 ? "meal" : "meals"} near you, ready to rescue.`
            : "No open pickups right now — new surplus posts throughout the evening."}
        </p>
      </header>

      {onboarding?.show && (
        <FirstRescueTracker step={onboarding.step} active={onboarding.active} />
      )}

      <ListingFeed listings={listings} canClaim={canClaim} />
    </main>
  );
}
