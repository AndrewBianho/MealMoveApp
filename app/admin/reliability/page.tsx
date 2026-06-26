import { auth } from "@/auth";
import { isDemo } from "@/lib/mode";
import { restaurantAccuracySummaries } from "@/lib/accuracy";
import { RestaurantAccuracySummary } from "@/components/RestaurantAccuracySummary";

export const dynamic = "force-dynamic";

// Org-admin operations view: how dependable each restaurant's pickups have been,
// per volunteer rescue-accuracy signals. The /admin prefix is org-admin-gated in
// auth.config, so this page is org-admin only. Private by design — an internal
// operations read-out, never a public leaderboard or a grade on a partner.
export default async function AdminReliabilityPage() {
  await auth();
  const demo = await isDemo();
  const rows = await restaurantAccuracySummaries(demo);

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
          Restaurant reliability
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          How often pickups were there and as described, from volunteers. This is
          an internal operations signal — keep it private; it&apos;s never shown
          publicly or used to rank partners.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-700">
          No accuracy signals yet — they appear here as volunteers complete pickups.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <div key={r.restaurantId} className="rounded-3xl bg-card p-6 shadow-card">
              <h2 className="mb-2 text-lg font-semibold">{r.restaurantName}</h2>
              <RestaurantAccuracySummary data={r.aggregate} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
