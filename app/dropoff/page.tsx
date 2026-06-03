import { ListingCard } from "@/components/ListingCard";
import { getDropOffs } from "@/lib/map";
import { getListings } from "@/lib/listings";

export const dynamic = "force-dynamic";

export default async function DropoffPage() {
  const [all, locations] = await Promise.all([getListings(), getDropOffs()]);
  const incoming = all.filter(
    (l) => l.dropOff && ["claimed", "in transit"].includes(l.status)
  );
  const arrived = all.filter((l) => l.dropOff && l.status === "delivered");

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">Drop-off</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Your locations and what they can take, plus what&apos;s headed their
          way.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-medium">Locations &amp; what they accept</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {locations.map((d) => (
            <div
              key={d.id}
              className="rounded-xl border border-neutral-200/40 bg-white p-4"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{d.name}</h3>
                <span
                  className={
                    "rounded-[3px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide " +
                    (d.refrigerated
                      ? "bg-transit-50 text-transit-800"
                      : "bg-neutral-50 text-neutral-800")
                  }
                >
                  {d.refrigerated ? "refrigerated" : "ambient"}
                </span>
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {d.acceptedCategories.map((c) => (
                  <span
                    key={c}
                    className="rounded-[3px] bg-rescued-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-rescued-800"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <p className="font-mono text-xs text-neutral-600">
                holds up to {d.capacity} servings
              </p>
              {d.notes && (
                <p className="mt-1 text-xs text-neutral-600">{d.notes}</p>
              )}
            </div>
          ))}
        </div>
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
