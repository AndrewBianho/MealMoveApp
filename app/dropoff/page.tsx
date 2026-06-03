import { ListingCard } from "@/components/ListingCard";
import { getListings } from "@/lib/listings";

export const dynamic = "force-dynamic";

export default async function DropoffPage() {
  const all = await getListings();
  const incoming = all.filter(
    (l) => l.dropOff && ["claimed", "in transit"].includes(l.status)
  );
  const arrived = all.filter((l) => l.dropOff && l.status === "delivered");

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">Drop-off</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Rescues headed to your locations, and what&apos;s already arrived.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-medium">Incoming</h2>
        {incoming.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {incoming.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">Nothing inbound right now.</p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">Arrived</h2>
        {arrived.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {arrived.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">No deliveries logged yet.</p>
        )}
      </section>
    </main>
  );
}
