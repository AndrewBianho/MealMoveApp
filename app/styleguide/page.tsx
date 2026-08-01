import { Button } from "@/components/Button";
import { cn } from "@/components/cn";
import { ListingCard } from "@/components/ListingCard";
import { MetricCard } from "@/components/MetricCard";
import { ReliabilityMeter } from "@/components/ReliabilityMeter";
import { StatusBadge } from "@/components/StatusBadge";
import { MapPlannerDemo } from "@/components/map/MapPlannerDemo";
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

// A claimed listing (has source, drop-off, and a claimant) to show how the card
// reframes itself per audience.
const AUDIENCE_DEMO = LISTINGS.find((l) => l.status === "claimed") ?? LISTINGS[0];

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
      <p className="mb-4 text-sm text-neutral-700">{hint}</p>
      {children}
    </section>
  );
}

export default function StyleGuidePage() {
  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header>
        <p className="font-mono text-[10px] text-neutral-700">
          Design system · live components
        </p>
        <h1 className="mt-2 text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">Style guide</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-700">
          Every element below is a real React component built against the tokens
          in tailwind.config.ts.
        </p>
      </header>

      <Section
        title="Status badges"
        hint="Mono, sentence case, the status color as text — no dot, no filled pill. The word names the status; color reinforces."
      >
        <div className="flex flex-wrap gap-2 rounded-xl border border-neutral-200/40 bg-card p-5">
          {STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section
        title="Buttons"
        hint="Primary, secondary, danger, ghost. Focus ring only — no shadows."
      >
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200/40 bg-card p-5">
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
              <span className="font-mono text-xs text-neutral-700">
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
              <span className="font-mono text-xs text-neutral-700">
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

      <Section
        title="Listing cards by audience"
        hint="One claimed listing seen by each account type. Volunteers get servings · distance and the claim affordance. Restaurants drop the meaningless distance and their own (redundant) source line, keeping the → drop-off destination. Drop-offs drop the distance and the self-referential → drop-off line, and surface 'from {restaurant}' instead."
      >
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <p className="mb-2 font-mono text-[10px] text-neutral-700">
              Volunteer
            </p>
            <ListingCard listing={AUDIENCE_DEMO} audience="volunteer" />
          </div>
          <div>
            <p className="mb-2 font-mono text-[10px] text-neutral-700">
              Restaurant
            </p>
            <ListingCard listing={AUDIENCE_DEMO} audience="restaurant" />
          </div>
          <div>
            <p className="mb-2 font-mono text-[10px] text-neutral-700">
              Drop-off
            </p>
            <ListingCard listing={AUDIENCE_DEMO} audience="dropoff" />
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
          <div className="space-y-4 rounded-xl border border-neutral-200/40 bg-card p-5">
            <ReliabilityMeter name="Marcus L." pct={94} />
            <ReliabilityMeter name="Dana K." pct={68} />
            <ReliabilityMeter name="Sam O." pct={41} />
          </div>
        </Section>

        <Section
          title="Trip planner"
          hint="The rescue map's itinerary and location search. Fixed slots — start, pickup, drop-off, end — filled by tapping pins on the real map; the ranked candidates hang off whichever slot is still empty. Type 'sun' in the field to see on-map locations rank above addresses."
        >
          <MapPlannerDemo />
        </Section>
      </div>

      <p className="mt-12 font-mono text-[11px] text-neutral-700">
        next.js 14 · app router · tailwind v3 · fraunces · nunito sans · jetbrains mono
      </p>
    </main>
  );
}
