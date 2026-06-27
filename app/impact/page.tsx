import { MetricCard, metricAccent } from "@/components/MetricCard";
import { ReliabilityMeter } from "@/components/ReliabilityMeter";
import { getImpactStats, getRestaurantImpactStats, getVolunteerReliability } from "@/lib/stats";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ImpactPage() {
  const session = await auth();
  const role = session?.user?.role;
  const isOrgAdmin = role === "org_admin";

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

  const heading = restaurant ? "Your restaurant's impact" : "Chapter impact";

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">{heading}</h1>
        {restaurant && (
          <p className="mt-1 text-sm text-neutral-700">
            What {restaurant.name} has helped rescue and move into the community.
          </p>
        )}
      </header>

      {loadFailed ? (
        <div className="mb-10 rounded-2xl border border-neutral-200/60 bg-card p-6 text-sm text-neutral-700 shadow-card">
          These numbers are taking a moment to load. Refresh the page in a few
          seconds and they&apos;ll be back.
        </div>
      ) : (
        <div className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <MetricCard key={s.label} label={s.label} value={s.value} accent={metricAccent(s.label)} />
          ))}
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
