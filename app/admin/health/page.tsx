import Link from "next/link";
import { auth } from "@/auth";
import { isDemo } from "@/lib/mode";
import { getHealthMetrics, type Ratio } from "@/lib/health";
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

function Metric({
  value,
  label,
  caption,
}: {
  value: string;
  label: string;
  caption: string;
}) {
  return (
    <div className="rounded-3xl bg-card p-6 shadow-card">
      <div className="font-display text-4xl font-semibold leading-none text-rescued-600">
        {value}
      </div>
      <div className="mt-2 text-sm font-semibold">{label}</div>
      <div className="mt-1 font-mono text-[11px] text-neutral-600">{caption}</div>
    </div>
  );
}

export default async function AdminHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await auth();
  const demo = await isDemo();
  const { days } = await searchParams;
  const windowDays = WINDOWS.some((w) => String(w.days) === days)
    ? Number(days)
    : 30;

  const m = await getHealthMetrics(windowDays, demo);

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
          Operations health
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          How the system is running — the bottlenecks public impact numbers
          don&apos;t show. Internal only.
        </p>
      </header>

      <nav aria-label="Time window" className="mb-6 flex flex-wrap gap-2">
        {WINDOWS.map((w) => {
          const active = w.days === windowDays;
          return (
            <Link
              key={w.days}
              href={`/admin/health?days=${w.days}`}
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric
          value={pct(m.claimRate)}
          label="Claim rate"
          caption={detail(m.claimRate, "posts claimed in time")}
        />
        <Metric
          value={m.medianTimeToClaimMin == null ? "—" : `${m.medianTimeToClaimMin} min`}
          label="Median time to claim"
          caption={`across ${m.claimRate.num} claimed posts`}
        />
        <Metric
          value={pct(m.completionRate)}
          label="Completion rate"
          caption={detail(m.completionRate, "claims delivered")}
        />
        <Metric
          value={pct(m.repeatPostRate)}
          label="Restaurant repeat-post rate"
          caption={detail(m.repeatPostRate, "restaurants posted again")}
        />
        <Metric
          value={pct(m.firstTimeCompletionRate)}
          label="First-time volunteer completion"
          caption={detail(m.firstTimeCompletionRate, "newcomers delivered")}
        />
        <Metric
          value={m.posted.toLocaleString()}
          label="Listings posted"
          caption={`in the last ${m.windowDays} days`}
        />
      </div>
    </main>
  );
}
