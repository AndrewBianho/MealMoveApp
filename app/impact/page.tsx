import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { MetricCard, metricAccent } from "@/components/MetricCard";
import { PersonalHarvest } from "@/components/PersonalHarvest";
import { ReliabilityMeter } from "@/components/ReliabilityMeter";
import { PickupSections } from "@/components/PickupSections";
import { DropOffImpact } from "@/components/DropOffImpact";
import {
  getImpactStats,
  getRestaurantImpactStats,
  getVolunteerReliability,
  getVolunteerImpact,
  getDropOffImpactStats,
  getDropOffDonations,
} from "@/lib/stats";
import { getListings } from "@/lib/listings";
import { isDemo } from "@/lib/mode";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { VolunteerImpact } from "@/lib/types";

export const dynamic = "force-dynamic";

// Your account + your impact, merged into one page (the old /profile stats
// folded in here). The identity header is the same for everyone; the numbers
// below it always match the account type — a volunteer sees their harvest, a
// restaurant its donations, a drop-off what it received, an org admin the whole
// chapter. A volunteer's `/profile` is now its own editable identity page; the
// other roles' avatars still redirect from `/profile` to here.
export default async function ImpactPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      role: true,
      createdAt: true,
      dropOffId: true,
      imageUrl: true,
      restaurant: { select: { id: true, name: true } },
    },
  });
  if (!user) redirect("/login");

  // The whole page reads the viewer's current world; demo and real never mix.
  const demo = await isDemo();

  const role = user.role;
  const isOrgAdmin = role === "org_admin";
  const isVolunteer = role === "volunteer";
  const isDropOff = role === "drop_off";
  const restaurant = role === "restaurant" ? user.restaurant : null;

  const joined = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(user.createdAt);

  // A volunteer leads with their own harvest — lifetime numbers, then the past
  // pickups behind them (what's in flight lives on the feed now).
  let myImpact: VolunteerImpact | null = null;
  let myPast: Awaited<ReturnType<typeof getListings>> = [];
  if (isVolunteer) {
    myImpact = await getVolunteerImpact(userId, demo);
    const all = await getListings(userId);
    myPast = all.filter(
      (l) => l.mine && ["delivered", "expired", "failed"].includes(l.status)
    );
  }

  // A drop-off account's own location impact — stats + past donations.
  let dropOffStats: Awaited<ReturnType<typeof getDropOffImpactStats>> = [];
  let donations: Awaited<ReturnType<typeof getDropOffDonations>> = [];
  if (isDropOff && user.dropOffId) {
    dropOffStats = await getDropOffImpactStats(user.dropOffId, demo);
    donations = await getDropOffDonations(user.dropOffId, demo);
  }

  // Restaurant / volunteer / org-admin all read the ramp of aggregate stats
  // (scoped to the restaurant, or chapter-wide). Per-volunteer reliability is
  // for org admins only — non-punitive and never exposed to partners. Fetched
  // sequentially and behind a try/catch to keep peak connections low and fail
  // calm. Drop-offs use their own aggregates above, so skip this entirely.
  let stats: Awaited<ReturnType<typeof getImpactStats>> = [];
  let volunteers: Awaited<ReturnType<typeof getVolunteerReliability>> = [];
  let loadFailed = false;
  if (!isDropOff) {
    try {
      stats = restaurant
        ? await getRestaurantImpactStats(restaurant.id, demo)
        : await getImpactStats(demo);
      if (isOrgAdmin) volunteers = await getVolunteerReliability(demo);
    } catch {
      loadFailed = true;
    }
  }

  const subtitle = restaurant
    ? `What ${restaurant.name} has helped rescue and move into the community.`
    : isVolunteer
      ? "The pickups behind your numbers."
      : isDropOff
        ? "What your location has received, and the donations behind it."
        : "Every number here is food that reached people instead of the bin.";

  // Chapter stats arrive food-first (meals, lbs, hours), then the operation.
  const foodMoved = stats.slice(0, 3);
  const operation = stats.slice(3);

  // Width follows content (DESIGN.md), so this page caps at 5xl rather than the
  // shared 1760px shell: nothing here exceeds 896px for any role — harvest panel
  // and stat grids at max-w-4xl, past pickups at 780px, org-admin reliability at
  // max-w-xl. Under 1760px that stranded ~680px of dead surface on one side at a
  // 1600px viewport; capped, the same whitespace becomes symmetric margin. The
  // feed does the same with max-w-[1200px] around its 1136px of content.
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 flex items-center gap-4">
        <Avatar name={user.name} src={user.imageUrl} size="lg" className="shadow-card" />
        <div>
          <h1 className="font-display text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
            {user.name}
          </h1>
          <p className="mt-0.5 font-mono text-[13px] text-neutral-700">
            {role.replace(/_/g, " ")} · joined {joined}
          </p>
        </div>
      </header>

      <p className="mb-8 max-w-[72ch] text-[16px] text-neutral-700">{subtitle}</p>

      {isDropOff ? (
        <DropOffImpact stats={dropOffStats} donations={donations} />
      ) : (
        <>
          {myImpact && (
            <div className="mb-10 max-w-4xl space-y-8">
              <section>
                <PersonalHarvest impact={myImpact} />
                {myImpact.attempts > 0 && (
                  <div data-tour="reliability" className="mt-4 max-w-sm rounded-xl border border-neutral-200/40 bg-card p-5">
                    <p className="mb-3 font-mono text-[13px] text-neutral-700">
                      Your reliability
                    </p>
                    <ReliabilityMeter
                      name="Completed rescues"
                      pct={myImpact.completionRate}
                    />
                  </div>
                )}
              </section>

              <section>
                <h2 className="mb-3 font-mono text-[13px] text-neutral-700">
                  Past pickups
                </h2>
                {myPast.length > 0 ? (
                  <PickupSections active={[]} past={myPast} hadInvites={false} />
                ) : (
                  <p className="text-[16px] text-neutral-700">
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
            <div className="mb-10 rounded-2xl border border-neutral-200/60 bg-card p-6 text-[16px] text-neutral-700 shadow-card">
              These numbers are taking a moment to load. Refresh the page in a few
              seconds and they&apos;ll be back.
            </div>
          ) : (
            <div className="mb-10 max-w-4xl space-y-8">
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
              <section>
                <h2 className="mb-3 font-mono text-[13px] text-neutral-700">
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
              <p className="mb-4 text-[16px] text-neutral-700">
                A bar and a percentage — never a grade. We surface who needs support,
                not who to shame. Visible to org admins only.
              </p>
              {volunteers.length > 0 ? (
                <div className="max-w-xl space-y-4 rounded-xl border border-neutral-200/40 bg-card p-5">
                  {volunteers.map((v) => (
                    <div key={v.id}>
                      <ReliabilityMeter name={v.name} pct={v.reliability} />
                      <p className="mt-1 font-mono text-[13px] text-neutral-700">
                        {v.pickups} {v.pickups === 1 ? "pickup" : "pickups"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[16px] text-neutral-700">
                  No pickups yet — reliability appears once volunteers start claiming.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
