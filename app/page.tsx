import { ListingFeed } from "@/components/ListingFeed";
import { MetricCard } from "@/components/MetricCard";
import { IMPACT_STATS } from "@/lib/mock";
import { getListings } from "@/lib/listings";

// Reads live data per request (and after revalidation from server actions).
export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const listings = await getListings();

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">Open listings near you</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Claim a pickup and we&apos;ll hold it for fifteen minutes while you head
          over.
        </p>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {IMPACT_STATS.map((s) => (
          <MetricCard key={s.label} label={s.label} value={s.value} />
        ))}
      </div>

      <ListingFeed listings={listings} />
    </main>
  );
}
