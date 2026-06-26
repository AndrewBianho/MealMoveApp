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

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">Rescues near you</h1>
        <p className="mt-1 text-sm text-neutral-700">
          Claim a pickup and we&apos;ll hold it for fifteen minutes while you head
          over.
        </p>
      </header>

      {onboarding?.show && (
        <FirstRescueTracker step={onboarding.step} active={onboarding.active} />
      )}

      <ListingFeed listings={listings} canClaim={canClaim} />
    </main>
  );
}
