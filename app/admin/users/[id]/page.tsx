import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { MetricCard, metricAccent } from "@/components/MetricCard";
import { ReliabilityMeter } from "@/components/ReliabilityMeter";
import { PickupSections } from "@/components/PickupSections";
import { DropOffImpact } from "@/components/DropOffImpact";
import { RestaurantAccuracySummary } from "@/components/RestaurantAccuracySummary";
import {
  getRestaurantImpactStats,
  getVolunteerImpact,
  getDropOffImpactStats,
  getDropOffDonations,
} from "@/lib/stats";
import { restaurantAccuracy } from "@/lib/accuracy";
import { getListings } from "@/lib/listings";
import { isDemo } from "@/lib/mode";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireRole } from "@/lib/authz";
import { assertSameOrg } from "@/lib/orgRoster";
import type { VolunteerImpact } from "@/lib/types";

export const dynamic = "force-dynamic";

// One member's impact/analytics, opened from the Members roster. The /admin
// prefix is org-admin-gated in auth.config, so this page is org-admin only. It
// reuses the same stat helpers and cards as /impact, scoped to the selected
// member's account type: a volunteer's harvest + reliability + past pickups, a
// restaurant's donations + pickup accuracy, a drop-off's received-food stats.
// Org admins have no personal rescue numbers, so their view points to the
// chapter-wide analytics instead.
export default async function MemberDetailPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  await requireRole("org_admin");
  const demo = await isDemo();
  const session = await auth();
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      demo: true,
      imageUrl: true,
      organizationId: true,
      restaurant: { select: { id: true, name: true } },
      dropOff: { select: { id: true, name: true } },
    },
  });
  // Only members in the viewer's world — demo and real never mix.
  if (!user || user.demo !== demo) notFound();

  // Organizations scope volunteers/admins: an org admin can only open a managed
  // member in their own org. Partners (restaurant/drop_off) are global and skip
  // this guard. Block cross-org deep-links so one org can't view another's people.
  if (user.role === "volunteer" || user.role === "org_admin") {
    const actor = session?.user?.id
      ? await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { organizationId: true },
        })
      : null;
    if (!assertSameOrg(actor?.organizationId ?? null, user.organizationId)) {
      notFound();
    }
  }

  const role = user.role;
  const joined = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(user.createdAt);
  const venue = user.restaurant?.name ?? user.dropOff?.name ?? null;

  // Per-role impact, reusing /impact's helpers scoped to this member.
  let volunteerImpact: VolunteerImpact | null = null;
  let past: Awaited<ReturnType<typeof getListings>> = [];
  if (role === "volunteer") {
    volunteerImpact = await getVolunteerImpact(user.id, demo);
    const all = await getListings(user.id);
    past = all.filter(
      (l) => l.mine && ["delivered", "expired", "failed"].includes(l.status)
    );
  }

  let restaurantStats: Awaited<ReturnType<typeof getRestaurantImpactStats>> = [];
  let accuracy: Awaited<ReturnType<typeof restaurantAccuracy>> | null = null;
  if (role === "restaurant" && user.restaurant) {
    restaurantStats = await getRestaurantImpactStats(user.restaurant.id, demo);
    accuracy = await restaurantAccuracy(user.restaurant.id, demo);
  }

  let dropOffStats: Awaited<ReturnType<typeof getDropOffImpactStats>> = [];
  let donations: Awaited<ReturnType<typeof getDropOffDonations>> = [];
  if (role === "drop_off" && user.dropOff) {
    dropOffStats = await getDropOffImpactStats(user.dropOff.id, demo);
    donations = await getDropOffDonations(user.dropOff.id, demo);
  }

  // Restaurant metric ramp reads food-first (meals, lbs, hours), then operation.
  const foodMoved = restaurantStats.slice(0, 3);
  const operation = restaurantStats.slice(3);

  // Same reasoning as app/impact/page.tsx, which this page mirrors: every block
  // here caps at max-w-4xl (896px) with its stat grids nested inside, so the
  // shared 1760px shell stranded ~680px of dead surface on one side at a 1600px
  // viewport. Capped so that whitespace becomes symmetric margin instead.
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/admin/users"
        className="mb-6 inline-flex items-center gap-1 font-mono text-[13px] text-clay-800 underline-offset-2 hover:underline"
      >
        ← Members
      </Link>

      <header className="mb-8 flex items-center gap-4">
        <Avatar name={user.name} src={user.imageUrl} size="lg" className="shadow-card" />
        <div className="min-w-0">
          <h1 className="font-display text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
            {user.name}
          </h1>
          <p className="mt-0.5 font-mono text-[13px] text-neutral-700">
            {role.replace(/_/g, " ")}
            {venue ? ` · ${venue}` : ""} · joined {joined}
            {user.status !== "active" ? ` · ${user.status}` : ""}
          </p>
        </div>
      </header>

      {role === "volunteer" && volunteerImpact && (
        <div className="max-w-4xl space-y-8">
          <section>
            <h2 className="mb-3 font-mono text-[13px] text-neutral-700">
              Harvest so far
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label="meals rescued"
                value={String(volunteerImpact.mealsRescued)}
                accent={metricAccent("meals rescued")}
              />
              <MetricCard
                label="lbs saved"
                value={String(volunteerImpact.lbsSaved)}
                accent={metricAccent("lbs saved")}
              />
              <MetricCard
                label="rescues completed"
                value={String(volunteerImpact.pickupsCompleted)}
                accent={metricAccent("rescues completed")}
              />
            </div>
            {volunteerImpact.attempts > 0 && (
              <div className="mt-4 max-w-sm rounded-xl border border-neutral-200/40 bg-card p-5">
                <p className="mb-3 font-mono text-[13px] text-neutral-700">
                  Reliability
                </p>
                <ReliabilityMeter
                  name="Completed rescues"
                  pct={volunteerImpact.completionRate}
                />
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[13px] text-neutral-700">
              Past pickups
            </h2>
            {past.length > 0 ? (
              <PickupSections active={[]} past={past} hadInvites={false} />
            ) : (
              <p className="text-[16px] text-neutral-700">
                No completed pickups yet.
              </p>
            )}
          </section>
        </div>
      )}

      {role === "restaurant" && (
        <div className="max-w-4xl space-y-8">
          {restaurantStats.length > 0 ? (
            <>
              <section>
                <h2 className="mb-3 font-mono text-[13px] text-neutral-700">
                  Food moved
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {foodMoved.map((s) => (
                    <MetricCard key={s.label} label={s.label} value={s.value} accent={metricAccent(s.label)} />
                  ))}
                </div>
              </section>
              {operation.length > 0 && (
                <section>
                  <h2 className="mb-3 font-mono text-[13px] text-neutral-700">
                    Rescue network
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {operation.map((s) => (
                      <MetricCard key={s.label} label={s.label} value={s.value} accent={metricAccent(s.label)} />
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <p className="text-[16px] text-neutral-700">
              No donations yet — stats appear once this restaurant&apos;s posts
              are rescued.
            </p>
          )}
          {accuracy && (
            <section className="max-w-md rounded-2xl border border-neutral-200/40 bg-card p-5 shadow-card">
              <h2 className="mb-2 text-lg font-medium">Pickup accuracy</h2>
              <p className="mb-3 text-[14px] text-neutral-700">
                How often pickups were there and as described — an internal
                signal, never a public grade.
              </p>
              <RestaurantAccuracySummary data={accuracy} />
            </section>
          )}
        </div>
      )}

      {role === "drop_off" && (
        <div className="max-w-4xl">
          <DropOffImpact stats={dropOffStats} donations={donations} />
        </div>
      )}

      {role === "org_admin" && (
        <div className="max-w-2xl rounded-2xl border border-neutral-200/40 bg-card p-6 shadow-card">
          <p className="text-[16px] text-neutral-700">
            Org admins oversee the chapter rather than run pickups, so there are
            no personal rescue numbers here.{" "}
            <Link
              href="/admin/analytics"
              className="font-semibold text-clay-800 underline-offset-2 hover:underline"
            >
              See chapter analytics
            </Link>
            .
          </p>
        </div>
      )}
    </main>
  );
}
