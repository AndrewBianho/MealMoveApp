import { Button } from "@/components/Button";
import { cn } from "@/components/cn";
import { ListingCard } from "@/components/ListingCard";
import { MetricCard } from "@/components/MetricCard";
import { ReliabilityMeter } from "@/components/ReliabilityMeter";
import { StatusBadge } from "@/components/StatusBadge";
import { LISTINGS } from "@/lib/mock";
import type { ListingStatus } from "@/lib/types";

const STATUSES: ListingStatus[] = [
  "open",
  "claimed",
  "in transit",
  "delivered",
  "expired",
  "failed",
];

// Mirror the feed's split: claimable (open) vs everything that can't be claimed.
const CLAIMABLE = LISTINGS.filter((l) => l.status === "open");
const UNCLAIMABLE = LISTINGS.filter((l) => l.status !== "open");

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="mb-4 text-sm text-neutral-600">{hint}</p>
      {children}
    </section>
  );
}

export default function StyleGuidePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-wide text-neutral-600">
          design system · live components
        </p>
        <h1 className="mt-2 text-[32px] font-medium leading-tight">Style guide</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-600">
          Every element below is a real React component built against the tokens
          in tailwind.config.ts.
        </p>
      </header>

      <Section
        title="Status badges"
        hint="Mono, uppercase, leading dot, fully round. Fill + text drawn from one ramp."
      >
        <div className="flex flex-wrap gap-2 rounded-xl border border-neutral-200/40 bg-white p-5">
          {STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section
        title="Buttons"
        hint="Primary, secondary, danger, ghost. Focus ring only — no shadows."
      >
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200/40 bg-white p-5">
          <Button variant="primary">Claim pickup</Button>
          <Button variant="secondary">View route</Button>
          <Button variant="danger">Report flake</Button>
          <Button variant="ghost">Dismiss</Button>
        </div>
      </Section>

      <Section
        title="Listing cards"
        hint="Volunteer view. Claimable food (open) sits up top; everything that can't be claimed — claimed, in transit, or closed — drops into its own subsection. Urgency chip pairs icon + minutes (never hue alone): tomato under 10 min with a pulse, honey under 35, sage otherwise; neutral 'closed' when spent. The closing-soon open card is featured across two columns."
      >
        <div className="space-y-8">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-base font-semibold text-neutral-800">
                Available to claim
              </h3>
              <span className="font-mono text-xs text-neutral-400">
                {CLAIMABLE.length}
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {CLAIMABLE.map((l) => (
                <div
                  key={l.id}
                  className={cn(l.minutesLeft < 10 && "md:col-span-2")}
                >
                  <ListingCard listing={l} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-base font-semibold text-neutral-800">
                Claimed &amp; closed
              </h3>
              <span className="font-mono text-xs text-neutral-400">
                {UNCLAIMABLE.length}
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {UNCLAIMABLE.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          </div>
        </div>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Impact metrics" hint="Mono values on a neutral fill.">
          <div className="grid grid-cols-2 gap-4">
            <MetricCard label="meals rescued" value="12,480" />
            <MetricCard label="pickups this week" value="37" />
            <MetricCard label="lbs diverted" value="2,140" />
            <MetricCard label="active volunteers" value="58" />
          </div>
        </Section>

        <Section
          title="Reliability meter"
          hint="Non-punitive — a bar and a percentage, never a grade."
        >
          <div className="space-y-4 rounded-xl border border-neutral-200/40 bg-white p-5">
            <ReliabilityMeter name="Marcus L." pct={94} />
            <ReliabilityMeter name="Dana K." pct={68} />
            <ReliabilityMeter name="Sam O." pct={41} />
          </div>
        </Section>
      </div>

      <p className="mt-12 font-mono text-[11px] text-neutral-400">
        next.js 14 · app router · tailwind v3 · fraunces · nunito sans · jetbrains mono
      </p>
    </main>
  );
}
