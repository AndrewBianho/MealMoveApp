import { ListingCard } from "@/components/ListingCard";
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
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">My pickups</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Everything you&apos;ve claimed, in flight, or completed.
        </p>
      </header>

      <div className="mb-8 max-w-sm rounded-xl border border-neutral-200/40 bg-white p-5">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
          your reliability · last 30 days
        </p>
        <ReliabilityMeter name="On-time completion" pct={91} />
      </div>

      {invited.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-medium">Buddy invites</h2>
          <p className="mb-4 text-sm text-neutral-600">
            Volunteers who asked you to join them — open one to accept.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {invited.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-medium">Active</h2>
        {active.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {active.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">
            Nothing in flight right now. Claim a pickup from the feed.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">History</h2>
        {past.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {past.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">No completed pickups yet.</p>
        )}
      </section>
    </main>
  );
}
