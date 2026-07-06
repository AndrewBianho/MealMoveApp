import { MetricCard, metricAccent } from "@/components/MetricCard";
import { ReliabilityMeter } from "@/components/ReliabilityMeter";
import { PickupSections } from "@/components/PickupSections";
import {
  getImpactStats,
  getRestaurantImpactStats,
  getVolunteerReliability,
  getVolunteerImpact,
} from "@/lib/stats";
import { getListings } from "@/lib/listings";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { VolunteerImpact } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ImpactPage() {
  const session = await auth();
  const role = session?.user?.role;
  const isOrgAdmin = role === "org_admin";
  const isVolunteer = role === "volunteer";

  // A volunteer's page leads with their own harvest — lifetime numbers, then
  // the past pickups behind them ("My pickups" merged into this page; what's
  // in flight lives on the feed now).
  let myImpact: VolunteerImpact | null = null;
  let myPast: Awaited<ReturnType<typeof getListings>> = [];
  if (isVolunteer && session?.user?.id) {
    myImpact = await getVolunteerImpact(session.user.id);
    const all = await getListings(session.user.id);
    myPast = all.filter(
      (l) => l.mine && ["delivered", "expired", "failed"].includes(l.status)
    );
  }

  // A restaurant sees its own impact, not the whole chapter's. Resolve the
  // restaurant this member belongs to and scope the stats to it.
  const restaurant =
    role === "restaurant" && session?.user?.id
      ? (
          await prisma.user.findUnique({
            where: { id: session.user.id },
            include: { restaurant: true },
          })
        )?.restaurant ?? null
      : null;

  // Per-volunteer reliability is for the org admins who keep the operation
  // healthy — never restaurants or drop-offs. Reliability is non-punitive and
  // must not be exposed to partners who could use it to screen volunteers, so
  // we don't even fetch the named list unless an org admin is viewing.
  //
  // Fetched sequentially (not Promise.all) and behind a try/catch: the stats
  // queries are connection-heavy, so we keep the page's peak connection use low
  // and, if the database is briefly unreachable, show a calm retry note instead
  // of throwing the whole route into the error boundary.
  let stats: Awaited<ReturnType<typeof getImpactStats>> = [];
  let volunteers: Awaited<ReturnType<typeof getVolunteerReliability>> = [];
  let loadFailed = false;
  try {
    stats = restaurant
      ? await getRestaurantImpactStats(restaurant.id)
      : await getImpactStats();
    if (isOrgAdmin) volunteers = await getVolunteerReliability();
  } catch {
    loadFailed = true;
  }

  const heading = restaurant
    ? "Your restaurant's impact"
    : isVolunteer
      ? "Your impact"
      : "Chapter impact";

  // The stats arrive in a stable order: the food story first (meals, lbs,
  // hours), then the operation around it. Grouping them gives the page a
  // hierarchy — what was rescued leads, who's moving it supports.
  const foodMoved = stats.slice(0, 3);
  const operation = stats.slice(3);

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header className="mb-8">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">{heading}</h1>
        <p className="mt-1 max-w-[72ch] text-sm text-neutral-700">
          {restaurant
            ? `What ${restaurant.name} has helped rescue and move into the community.`
            : isVolunteer
              ? "Your harvest so far, and the pickups behind it."
              : "Every number here is food that reached people instead of the bin."}
        </p>
      </header>

      {myImpact && (
        <div className="mb-10 max-w-4xl space-y-8">
          <section>
            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wide text-neutral-600">
              your harvest so far
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label="meals rescued"
                value={String(myImpact.mealsRescued)}
                accent={metricAccent("meals rescued")}
              />
              <MetricCard
                label="lbs saved"
                value={String(myImpact.lbsSaved)}
                accent={metricAccent("lbs saved")}
              />
              <MetricCard
                label="rescues completed"
                value={String(myImpact.pickupsCompleted)}
                accent={metricAccent("rescues completed")}
              />
            </div>
            {myImpact.attempts > 0 && (
              <div className="mt-4 max-w-sm rounded-xl border border-neutral-200/40 bg-card p-5">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
                  your reliability
                </p>
                <ReliabilityMeter
                  name="Completed rescues"
                  pct={myImpact.completionRate}
                />
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wide text-neutral-600">
              past pickups
            </h2>
            {myPast.length > 0 ? (
              <PickupSections active={[]} past={myPast} hadInvites={false} />
            ) : (
              <p className="text-sm text-neutral-700">
                No completed pickups yet — your finished rescues will collect
                here.
              </p>
            )}
          </section>

          <h2 className="border-t border-neutral-200/50 pt-8 text-lg font-medium">
            Chapter impact
          </h2>
        </div>
      )}

      {loadFailed ? (
        <div className="mb-10 rounded-2xl border border-neutral-200/60 bg-card p-6 text-sm text-neutral-700 shadow-card">
          These numbers are taking a moment to load. Refresh the page in a few
          seconds and they&apos;ll be back.
        </div>
      ) : (
        <div className="mb-10 max-w-4xl space-y-8">
          <section>
            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wide text-neutral-600">
              food moved
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {foodMoved.map((s) => (
                <MetricCard key={s.label} label={s.label} value={s.value} accent={metricAccent(s.label)} />
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wide text-neutral-600">
              {restaurant ? "your rescue network" : "who's moving it"}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {operation.map((s) => (
                <MetricCard key={s.label} label={s.label} value={s.value} accent={metricAccent(s.label)} />
              ))}
            </div>
          </section>
        </div>
      )}

      {isOrgAdmin && !loadFailed && (
        <section>
          <h2 className="mb-1 text-lg font-medium">Volunteer reliability</h2>
          <p className="mb-4 text-sm text-neutral-700">
            A bar and a percentage — never a grade. We surface who needs support,
            not who to shame. Visible to org admins only.
          </p>
          {volunteers.length > 0 ? (
            <div className="max-w-xl space-y-4 rounded-xl border border-neutral-200/40 bg-card p-5">
              {volunteers.map((v) => (
                <div key={v.id}>
                  <ReliabilityMeter name={v.name} pct={v.reliability} />
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
                    {v.pickups} {v.pickups === 1 ? "pickup" : "pickups"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-700">
              No pickups yet — reliability appears once volunteers start claiming.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
