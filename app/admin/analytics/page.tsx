import Link from "next/link";
import { auth } from "@/auth";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { isDemo } from "@/lib/mode";
import { isSuperAdmin } from "@/lib/roles";
import { getHealthMetrics, type Ratio } from "@/lib/health";
import { getDashboardData } from "@/lib/analytics/dashboardData";
import { getOrgVolunteerImpact } from "@/lib/orgStats";
import { ACCENTS, type MetricAccent } from "@/components/MetricCard";
import { OrgStatsSwitcher } from "@/components/OrgStatsSwitcher";
import { cn } from "@/components/cn";

export const dynamic = "force-dynamic";

const WINDOWS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

function pct(r: Ratio): string {
  return r.value == null ? "—" : `${Math.round(r.value * 100)}%`;
}

// A ratio's "n of m" so an admin can reconcile the percentage with the records.
function detail(r: Ratio, noun: string): string {
  return r.den === 0 ? `no ${noun} yet` : `${r.num} of ${r.den} ${noun}`;
}

// Ops-health metric card: reconciling "n of m" caption, with a per-metric
// accent (value color + soft corner glow) drawn from MetricCard's ramps so a
// grid of stats reads with a little wayfinding instead of a row of sage twins.
function Metric({
  value,
  label,
  caption,
  accent = "rescued",
}: {
  value: string;
  label: string;
  caption: string;
  accent?: MetricAccent;
}) {
  const a = ACCENTS[accent];
  return (
    <div className="group relative overflow-hidden rounded-3xl bg-card p-6 shadow-card">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-50 blur-2xl",
          a.glow
        )}
      />
      <div className={cn("relative font-display text-4xl font-semibold leading-none", a.value)}>
        {value}
      </div>
      <div className="relative mt-2 text-sm font-semibold">{label}</div>
      <div className="relative mt-1 font-mono text-[11px] text-neutral-700">{caption}</div>
    </div>
  );
}

// A calm horizontal bar for the funnel — sage fill, width proportional to the
// claimed total, mono count so it reads without relying on color alone.
function FunnelBar({ label, count, total }: { label: string; count: number; total: number }) {
  const barPct = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm text-neutral-800">{label}</span>
        <span className="font-mono text-[13px] text-neutral-700">{count}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full rounded-full bg-rescued-400" style={{ width: `${barPct}%` }} />
      </div>
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; org?: string }>;
}) {
  await requireRole("org_admin");
  const session = await auth();
  const demo = await isDemo();
  const { days, org: orgParam } = await searchParams;
  const windowDays = WINDOWS.some((w) => String(w.days) === days)
    ? Number(days)
    : 30;

  const [m, d] = await Promise.all([
    getHealthMetrics(windowDays, demo),
    getDashboardData(windowDays, demo),
  ]);
  const funnelTotal = d.funnel.claimed;

  // A super admin sees every org and can pick one to scope the volunteer-
  // centric sections below; an org admin is always scoped to their own.
  const superAdmin = isSuperAdmin(session?.user?.role);
  const orgs = superAdmin
    ? await prisma.organization.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  // The acting admin's own organization — used for a plain org admin's scope,
  // and as the default label source. Skipped gracefully if unlinked.
  const actor = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { organization: { select: { name: true, id: true } } },
      })
    : null;

  // For a super admin, the selected org comes from `?org=` (none = all orgs,
  // no org section rendered); everyone else keeps their own organization.
  const selectedOrgId = superAdmin
    ? orgParam ?? null
    : (actor?.organization?.id ?? null);
  const selectedOrgName = superAdmin
    ? (orgs.find((o) => o.id === selectedOrgId)?.name ?? null)
    : (actor?.organization?.name ?? null);
  const orgImpact = selectedOrgId
    ? await getOrgVolunteerImpact(selectedOrgId, { world: demo ? "demo" : "real" })
    : null;

  // Preserve `?org=` across the time-window links so a super admin's org
  // selection survives switching windows.
  function withDays(dayCount: number): string {
    const next = new URLSearchParams();
    next.set("days", String(dayCount));
    if (superAdmin && orgParam) next.set("org", orgParam);
    return `/admin/analytics?${next.toString()}`;
  }

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header className="mb-6">
        <h1 className="font-display text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
          Analytics
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          How much food moves and how reliably — the bottlenecks public impact
          numbers don&apos;t show. Internal only.
        </p>
      </header>

      <nav aria-label="Time window" className="mb-6 flex flex-wrap gap-2">
        {WINDOWS.map((w) => {
          const active = w.days === windowDays;
          return (
            <Link
              key={w.days}
              href={withDays(w.days)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400",
                active
                  ? "bg-neutral-900 text-white"
                  : "bg-white text-neutral-700 shadow-card hover:-translate-y-0.5"
              )}
            >
              {w.label}
            </Link>
          );
        })}
      </nav>

      {superAdmin && <OrgStatsSwitcher orgs={orgs} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric
          value={d.servingsRescued.toLocaleString()}
          label="Meals rescued"
          caption={`from posts in the last ${m.windowDays} days`}
          accent="rescued"
        />
        <Metric
          value={m.posted.toLocaleString()}
          label="Listings posted"
          caption={`in the last ${m.windowDays} days`}
          accent="clay"
        />
        <Metric
          value={pct(m.claimRate)}
          label="Claim rate"
          caption={detail(m.claimRate, "posts claimed in time")}
          accent="rescued"
        />
        <Metric
          value={m.medianTimeToClaimMin == null ? "—" : `${m.medianTimeToClaimMin} min`}
          label="Median time to claim"
          caption={`across ${m.claimRate.num} claimed posts`}
          accent="clay"
        />
        <Metric
          value={pct(m.completionRate)}
          label="Completion rate"
          caption={detail(m.completionRate, "claims delivered")}
          accent="transit"
        />
        <Metric
          value={pct(m.repeatPostRate)}
          label="Restaurant repeat-post rate"
          caption={detail(m.repeatPostRate, "restaurants posted again")}
          accent="clay"
        />
        <Metric
          value={pct(m.firstTimeCompletionRate)}
          label="First-time volunteer completion"
          caption={detail(m.firstTimeCompletionRate, "newcomers delivered")}
          accent="transit"
        />
      </div>

      {selectedOrgId && selectedOrgName && orgImpact && (
        <section className="mt-8">
          <h2 className="mb-1 font-display text-lg font-semibold">
            {selectedOrgName} volunteers
          </h2>
          <p className="mb-4 font-mono text-[11px] text-neutral-700">
            {superAdmin
              ? "this organization's lifetime rescue impact"
              : "your organization's lifetime rescue impact"}
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric
              value={orgImpact.meals.toLocaleString()}
              label="Meals rescued"
              caption={`by ${selectedOrgName} volunteers`}
              accent="rescued"
            />
            <Metric
              value={orgImpact.volunteers.toLocaleString()}
              label="Active volunteers"
              caption="delivered at least one pickup"
              accent="rescued"
            />
            <Metric
              value={orgImpact.pickups.toLocaleString()}
              label="Pickups delivered"
              caption="completed rescues"
              accent="clay"
            />
          </div>
        </section>
      )}

      <section className="mt-8 rounded-3xl bg-card p-6 shadow-card">
        <h2 className="font-display text-lg font-semibold">Claim funnel</h2>
        <p className="mt-1 font-mono text-[11px] text-neutral-700">
          claimed &rarr; picked up &rarr; delivered
        </p>
        {funnelTotal === 0 ? (
          <p className="mt-4 text-sm text-neutral-700">
            No claims in this window yet — nothing to chart.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            <FunnelBar label="Claimed" count={d.funnel.claimed} total={funnelTotal} />
            <FunnelBar label="Picked up" count={d.funnel.pickedUp} total={funnelTotal} />
            <FunnelBar label="Delivered" count={d.funnel.delivered} total={funnelTotal} />
          </div>
        )}
      </section>
    </main>
  );
}
