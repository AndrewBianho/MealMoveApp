import { ListingFeed } from "@/components/ListingFeed";
import { ListingCard } from "@/components/ListingCard";
import { CurrentRescue } from "@/components/CurrentRescue";
import { FirstRescueTracker } from "@/components/FirstRescueTracker";
import { UpdatesBanner } from "@/components/UpdatesBanner";
import { redirect } from "next/navigation";
import { getListings } from "@/lib/listings";
import { getVolunteerOnboarding } from "@/lib/onboarding";
import { unseenCount } from "@/lib/announcements";
import { getDataMode } from "@/lib/mode";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireRole } from "@/lib/authz";
import { canClaimPickups, isAdmin } from "@/lib/roles";

// Reads live data per request (and after revalidation from server actions).
export const dynamic = "force-dynamic";

const LIVE = ["claimed", "in transit", "taken home"];

export default async function FeedPage() {
  await requireRole("volunteer", "org_admin");
  const session = await auth();
  // Org admins oversee rather than claim — the available-pickups feed isn't
  // their surface, so the root path sends them to their analytics home.
  if (isAdmin(session?.user?.role)) redirect("/admin/analytics");
  const viewerId = session?.user?.id;
  const listings = await getListings(viewerId);
  const world = await getDataMode();
  // Match the Header: only volunteers get the updates banner/badge (restaurants
  // and drop-offs aren't the audience, and org admins are redirected above).
  const updatesUnseen =
    viewerId && session?.user?.role === "volunteer"
      ? await unseenCount(viewerId, world)
      : 0;
  // Derived from the role rather than hardcoded to `true`: the route guards
  // above should leave only volunteers here, but the claim affordance answers to
  // the same predicate everywhere, so a future guard change can't silently hand
  // the feed's claim buttons to a non-volunteer.
  const canClaim = canClaimPickups(session?.user?.role);

  // The viewer's rescue in flight, if any. One rescue at a time: while this is
  // live they can't claim another, so it leads the page — the next step lives
  // here, not in the feed below.
  let current = listings.find((l) => l.mine && LIVE.includes(l.status));
  if (current) {
    // "Picked up" time for the card's lifecycle timeline (see lib/listings).
    const picked = await prisma.listingEvent.findFirst({
      where: { listingId: current.id, type: "in_transit" },
      orderBy: { at: "asc" },
      select: { at: true },
    });
    if (picked) current = { ...current, pickedUpAt: picked.at.getTime() };
  }

  // Pickups this volunteer has been invited to buddy — tap through to accept.
  const invites = viewerId
    ? await prisma.buddyInvite.findMany({
        where: { inviteeId: viewerId, status: "pending" },
        select: { listingId: true },
      })
    : [];
  const invitedIds = new Set(invites.map((i) => i.listingId));
  const invited = listings.filter((l) => invitedIds.has(l.id));

  // First-run activation: only volunteers see the first-rescue tracker, and only
  // until they complete their first rescue.
  const onboarding =
    session?.user?.role === "volunteer"
      ? await getVolunteerOnboarding(session.user.id)
      : null;

  // Meals claimable right now (open + live), for the sub-line.
  const openNow = listings.filter((l) => l.status === "open" && !l.scheduled).length;

  return (
    <main className="mx-auto max-w-[720px] px-6 py-10 sm:px-8 lg:max-w-[1200px]">
      <header className="mb-7 lg:max-w-2xl">
        <h1 className="font-display text-[36px] font-medium leading-[1.05] tracking-tight text-balance">
          Available pickups
        </h1>
        <p className="mt-2 text-[16px] font-medium text-neutral-700">
          {current
            ? "You've got a rescue in flight — finish it to claim the next one."
            : openNow > 0
              ? `${openNow} surplus ${openNow === 1 ? "meal" : "meals"} near you, ready to rescue.`
              : "No open pickups right now — new surplus posts throughout the evening."}
        </p>
      </header>

      <UpdatesBanner unseen={updatesUnseen} />

      {/* Always rendered, even with nothing in flight — CurrentRescue owns the
          delivery celebration, which has to outlive the revalidation that
          removes the delivered rescue from this slot. */}
      <CurrentRescue listing={current ?? null} />

      {invited.length > 0 && (
        <section className="mb-8 lg:max-w-2xl">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-[16px] font-semibold text-neutral-800">
              Buddy invites
            </h2>
            <span className="font-mono text-[13px] text-neutral-700">
              {invited.length}
            </span>
          </div>
          <p className="mb-3.5 text-[16px] text-neutral-700">
            Someone asked you to join their rescue — open one to accept.
          </p>
          <div className="flex flex-col gap-6">
            {invited.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>
      )}

      {onboarding?.show && (
        <div className="lg:max-w-2xl">
          <FirstRescueTracker step={onboarding.step} active={onboarding.active} />
        </div>
      )}

      <ListingFeed listings={listings} canClaim={canClaim} />
    </main>
  );
}
