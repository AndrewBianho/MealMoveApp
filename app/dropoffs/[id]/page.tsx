import Link from "next/link";
import { ListingCard } from "@/components/ListingCard";
import { getDropOffDetail } from "@/lib/listings";

export const dynamic = "force-dynamic";

export default async function DropOffDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const detail = await getDropOffDetail(params.id);

  if (!detail) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-6 py-16 text-center">
          <p className="text-sm text-neutral-600">Drop-off not found.</p>
          <Link
            href="/map"
            className="mt-4 inline-block text-sm font-medium text-rescued-600 hover:underline"
          >
            ← Back to the map
          </Link>
        </div>
      </main>
    );
  }

  const { dropOff, listings } = detail;
  const incoming = listings.filter((l) =>
    ["claimed", "in transit"].includes(l.status)
  );
  const arrived = listings.filter((l) => l.status === "delivered");

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/map"
        className="mb-4 inline-block text-sm text-neutral-600 hover:text-neutral-900"
      >
        ← Map
      </Link>

      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">{dropOff.name}</h1>
        <p className="mt-1 font-mono text-xs text-neutral-600">{dropOff.address}</p>
      </header>

      <section className="mb-8 rounded-xl border border-neutral-200/40 bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">What this location accepts</h2>
          <span
            className={
              "rounded-[3px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide " +
              (dropOff.refrigerated
                ? "bg-transit-50 text-transit-800"
                : "bg-neutral-50 text-neutral-800")
            }
          >
            {dropOff.refrigerated ? "refrigerated" : "ambient"}
          </span>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {dropOff.acceptedCategories.map((c) => (
            <span
              key={c}
              className="rounded-[3px] bg-rescued-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-rescued-800"
            >
              {c}
            </span>
          ))}
        </div>
        <p className="font-mono text-xs text-neutral-600">
          holds up to {dropOff.capacity} servings
        </p>
        {dropOff.notes && (
          <p className="mt-2 text-sm text-neutral-600">{dropOff.notes}</p>
        )}
      </section>

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
