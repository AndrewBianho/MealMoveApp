import { ListingCard } from "@/components/ListingCard";
import { RetrievalHoursDisplay } from "@/components/RetrievalHoursDisplay";
import { DetailHero } from "@/components/DetailHero";
import { SectionHeading } from "@/components/SectionHeading";
import { DetailEmpty, DetailNotFound } from "@/components/DetailEmpty";
import { getDropOffDetail } from "@/lib/listings";
import { parseStoredHours } from "@/lib/hours";

export const dynamic = "force-dynamic";

export default async function DropOffDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const detail = await getDropOffDetail(params.id);

  if (!detail) {
    return <DetailNotFound label="Drop-off not found." />;
  }

  const { dropOff, listings } = detail;
  const incoming = listings.filter((l) =>
    ["claimed", "in transit"].includes(l.status)
  );
  const arrived = listings.filter((l) => l.status === "delivered");

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <DetailHero
        backHref="/map"
        backLabel="Map"
        eyebrow="drop-off"
        title={dropOff.name}
        address={dropOff.address}
        badge={
          <span
            className={
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide " +
              (dropOff.refrigerated
                ? "bg-transit-50 text-transit-800"
                : "bg-neutral-100 text-neutral-600")
            }
          >
            {dropOff.refrigerated ? "❄ refrigerated" : "ambient"}
          </span>
        }
        stats={[
          { label: "capacity", value: dropOff.capacity },
          { label: "incoming", value: incoming.length },
          { label: "arrived", value: arrived.length },
        ]}
      />

      <section className="mt-6 rounded-2xl border border-neutral-200/50 bg-card p-5 shadow-card sm:p-6">
        <SectionHeading title="What this location accepts" />
        <div className="-mt-1 mb-3 flex flex-wrap gap-1.5">
          {dropOff.acceptedCategories.map((c) => (
            <span
              key={c}
              className="rounded-full bg-rescued-50 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-rescued-800"
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
        <div className="mt-4 border-t border-neutral-200/50 pt-4">
          <RetrievalHoursDisplay hours={parseStoredHours(dropOff.retrievalHours)} />
        </div>
      </section>

      <section className="mt-10">
        <SectionHeading title="Incoming" count={incoming.length} />
        {incoming.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {incoming.map((l) => (
              <ListingCard key={l.id} listing={l} audience="dropoff" />
            ))}
          </div>
        ) : (
          <DetailEmpty>Nothing inbound right now.</DetailEmpty>
        )}
      </section>

      <section className="mt-10">
        <SectionHeading title="Arrived" count={arrived.length} />
        {arrived.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {arrived.map((l) => (
              <ListingCard key={l.id} listing={l} audience="dropoff" />
            ))}
          </div>
        ) : (
          <DetailEmpty>No deliveries logged yet.</DetailEmpty>
        )}
      </section>
    </main>
  );
}
