import { ListingFeed } from "@/components/ListingFeed";
import { ListingCard } from "@/components/ListingCard";
import { FirstRescueTracker } from "@/components/FirstRescueTracker";
import { UpdatesBanner } from "@/components/UpdatesBanner";
import { StatusBadge } from "@/components/StatusBadge";
import Link from "next/link";
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

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ browse?: string }>;
}) {
  await requireRole("volunteer", "org_admin");
  // `?browse=1` is the deliberate escape from the takeover below: the volunteer
  // asked to see the feed while still carrying a rescue, so honour it instead
  // of bouncing them back. Nothing here lets them claim a second pickup —
  // `canClaim` stays false — so browsing is read-only by construction.
  const { browse } = await searchParams;
  const browsing = browse === "1";
  const session = await auth();
  // Org admins oversee rather than claim — the available-pickups feed isn't
  // their surface, so the root path sends them to their analytics home.
  if (isAdmin(session?.user?.role)) redirect("/admin/analytics");
  const viewerId = session?.user?.id;
  const listings = await getListings(viewerId);

  // A rescue in flight takes the app over. One rescue at a time means someone
  // already holding food can't claim anything here, so the browse feed is
  // mostly distraction — the listing they're working becomes the home screen
  // until it's delivered, released, or swept. Redirecting to the real detail
  // page (rather than rebuilding a slice of it here) means the takeover
  // carries the whole job: photos, chat, buddy, route, take-it-home, release.
  //
  // It's a default, not a cage: `?browse=1` (the detail page's "Browse other
  // pickups" link and the nav's Available tab) opts out, and the banner below
  // keeps the way back one tap away. Landing on `/` fresh still lands on the
  // rescue, so the commitment cue survives.
  //
  // Covers the buddy seat too: `mine` is true for both people on a claim.
  const current = listings.find((l) => l.mine && LIVE.includes(l.status));
  if (current && !browsing) redirect(`/listings/${current.id}`);

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
  // Browsing while carrying one means nothing here is claimable (one rescue at
  // a time — the server action enforces it too), so the feed presents itself
  // read-only rather than offering claim buttons that would be refused.
  const canClaim = canClaimPickups(session?.user?.role) && !current;

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
    <main className="mx-auto max-w-[720px] px-6 py-10 sm:px-8 lg:max-w-feed">
      <header className="mb-7 lg:max-w-3xl">
        <h1 className="font-display text-[36px] font-medium leading-[1.05] tracking-tight text-balance">
          Available pickups
        </h1>
        <p className="mt-2 text-[16px] font-medium text-neutral-700">
          {current
            ? "Browsing while you finish the one you're on — deliver or release it to claim another."
            : openNow > 0
              ? `${openNow} surplus ${openNow === 1 ? "meal" : "meals"} near you, ready to rescue.`
              : "No open pickups right now — new surplus posts throughout the evening."}
        </p>
      </header>

      {/* Only rendered in browse mode (otherwise `current` has already
          redirected). It leads the page because someone holding food should
          never have to hunt for the way back to it. Status is named in words,
          not just the honey hue. */}
      {current && (
        <section className="mb-8 rounded-3xl border border-neutral-200/70 bg-card p-6 shadow-card lg:max-w-3xl">
          {/* Surface stays neutral so the status keeps its own ramp: honey for
              claimed, plum once it's in transit. A honey card behind a plum
              word would fight the semantics. */}
          <p className="flex items-center gap-1.5 font-mono text-[13px] text-neutral-700">
            Your rescue
            <span aria-hidden>·</span>
            <StatusBadge status={current.status} />
          </p>
          <h2 className="mt-1.5 font-display text-[24px] font-medium leading-[1.18] tracking-tight text-neutral-900 text-balance">
            {current.title}
          </h2>
          <Link
            href={`/listings/${current.id}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-sm text-[16px] font-semibold text-clay-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
          >
            Back to your pickup
            <span aria-hidden>&rarr;</span>
          </Link>
        </section>
      )}

      <UpdatesBanner unseen={updatesUnseen} />

      {invited.length > 0 && (
        <section className="mb-8 lg:max-w-3xl">
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
        <div className="lg:max-w-3xl">
          <FirstRescueTracker step={onboarding.step} active={onboarding.active} />
        </div>
      )}

      <ListingFeed listings={listings} canClaim={canClaim} />
    </main>
  );
}
