import { ListingsMap } from "@/components/ListingsMap";
import { getListings } from "@/lib/listings";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const listings = (await getListings()).filter((l) =>
    ["open", "claimed", "in transit"].includes(l.status)
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">Map</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Active rescues near you. Pin color shows urgency — red is expiring
          soon. Allow location to center on you and see distances.
        </p>
      </header>

      <ListingsMap listings={listings} />
    </main>
  );
}
