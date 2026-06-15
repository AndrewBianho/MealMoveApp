import { ListingCard } from "@/components/ListingCard";
import { EmptyState } from "@/components/EmptyState";
import { ReliabilityMeter } from "@/components/ReliabilityMeter";
import { getListings } from "@/lib/listings";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function PickupsPage() {
  const session = await auth();
  const viewerId = session?.user?.id;
  const all = await getListings(viewerId);
  // `mine` is viewer-aware and covers both seats — the primary and the buddy.
  const mine = all.filter((l) => l.mine);
  const active = mine.filter((l) => ["claimed", "in transit"].includes(l.status));
  const past = mine.filter((l) =>
    ["delivered", "expired", "failed"].includes(l.status)
  );

  // Pickups this volunteer has been invited to buddy — tap through to accept.
  const invites = viewerId
    ? await prisma.buddyInvite.findMany({
        where: { inviteeId: viewerId, status: "pending" },
        select: { listingId: true },
      })
    : [];
  const invitedIds = new Set(invites.map((i) => i.listingId));
  const invited = all.filter((l) => invitedIds.has(l.id));

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">My pickups</h1>
        <p className="mt-1 text-sm text-neutral-700">
          Everything you&apos;ve claimed, in flight, or completed.
        </p>
      </header>

      <div className="mb-8 max-w-sm rounded-xl border border-neutral-200/40 bg-card p-5">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
          your reliability · last 30 days
        </p>
        <ReliabilityMeter name="On-time completion" pct={91} />
      </div>

      {invited.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-medium">Buddy invites</h2>
          <p className="mb-4 text-sm text-neutral-700">
            Volunteers who asked you to join them — open one to accept.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {invited.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-medium">Active</h2>
        {active.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {active.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                <path d="M3.3 7 12 12l8.7-5" />
                <path d="M12 22V12" />
              </svg>
            }
            title="Nothing in flight right now"
            hint="Claim a pickup from the feed and it'll show up here."
          />
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">History</h2>
        {past.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {past.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            }
            title="No completed pickups yet"
            hint="Your finished rescues will collect here."
          />
        )}
      </section>
    </main>
  );
}
