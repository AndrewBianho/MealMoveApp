import { ListingFeed } from "@/components/ListingFeed";
import { getListings } from "@/lib/listings";

// Reads live data per request (and after revalidation from server actions).
export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const listings = await getListings();

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">Rescues near you</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Claim a pickup and we&apos;ll hold it for fifteen minutes while you head
          over.
        </p>
      </header>

      <ListingFeed listings={listings} />
    </main>
  );
}
