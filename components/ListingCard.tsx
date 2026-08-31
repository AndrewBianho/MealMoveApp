import Link from "next/link";
import Image from "next/image";
import { cn } from "./cn";
import { Clock, MapPin, ArrowRight, Flame, Snowflake, Box } from "./icons";
import { StatusBadge } from "./StatusBadge";
import { NearbyVolunteers } from "./NearbyVolunteers";
import { InfoRows } from "./InfoRows";
import { DropOffName } from "./RetrievalHoursDisplay";
import { formatTimeLeft } from "@/lib/time";
import { capitalize } from "@/lib/text";
import type { Listing } from "@/lib/types";

export type ListingCardAudience = "volunteer" | "restaurant" | "dropoff";

interface ListingCardProps {
  listing: Listing;
  /** True when the viewer can claim pickups — an open listing then shows the
   *  "More details" link to the detail page, where the drop-off is chosen and
   *  the claim happens. */
  claimable?: boolean;
  /** Who's viewing — tunes which facts/lines show. Defaults to the volunteer view. */
  audience?: ListingCardAudience;
  /** Volunteers active near the pickup. Shown to the restaurant on open cards as
   *  a "will someone show up?" signal. */
  nearbyVolunteers?: number;
  /** Extra classes on the root — used for staggered entrance delays in the feed. */
  className?: string;
  /** Eager-load the photo. Set on the first card of the lead section only — it's
   *  the page's LCP element, and lazy-loading it delays the largest paint. */
  priorityImage?: boolean;
}

const SPENT: Listing["status"][] = ["delivered", "expired", "failed"];

// Listings without their own (or their restaurant's) photo fall back to the
// Meal Move logo, shown as a contained brand placeholder rather than a crop.
const DEFAULT_IMAGE = "/mealmovelogo.jpg";

// Urgency reads as one quiet status line at the top of the body — a mono word +
// the literal minutes ("closing soon · 6m"). The word (plus the minutes) names
// the state, so it stays legible without color (color-blind-safe); ramp text is
// the 800 stop for contrast. Bands: open (35m+) · soon (10–35) · closing soon
// (<10) · closed (spent) · taken home (deferred).
function urgency(listing: Listing) {
  if (SPENT.includes(listing.status)) {
    return { text: "text-neutral-700", word: "closed", minutes: null, held: true };
  }
  if (listing.status === "taken home") {
    return { text: "text-transit-800", word: "taken home", minutes: null, held: true };
  }
  const m = listing.minutesLeft;
  if (m < 10) {
    return { text: "text-failed-800", word: "closing soon", minutes: m, held: false };
  }
  if (m < 35) {
    return { text: "text-urgent-800", word: "soon", minutes: m, held: false };
  }
  return { text: "text-rescued-800", word: "open", minutes: m, held: false };
}

export function ListingCard({
  listing,
  claimable = false,
  audience = "volunteer",
  nearbyVolunteers,
  className,
  priorityImage = false,
}: ListingCardProps) {
  const {
    id,
    title,
    source,
    servings,
    distance,
    status,
    claimedBy,
    buddyName,
    dropOff,
    category,
    imageUrl,
    minutesLeft,
    availableLabel,
    recurrence,
    tempHandling,
    perishable,
  } = listing;

  const scheduled = !!listing.scheduled;
  const spent = SPENT.includes(status);
  const carsNeeded = listing.carsNeeded ?? 1;
  const claimedCount = listing.claimedCount ?? 0;
  const u = urgency(listing);
  const img = imageUrl ?? DEFAULT_IMAGE;
  const isPlaceholder = !imageUrl;

  // Handling cue — "what do I need to bring?". A glyph leads the word so the
  // temperature cue reads at a glance (the bounded set that earns a symbol); the
  // word stays for clarity. Calm neutral metadata, never competing with urgency.
  const handling = tempHandling
    ? tempHandling === "hot"
      ? { icon: Flame, label: "Keep hot" }
      : tempHandling === "cold"
        ? { icon: Snowflake, label: "Keep cold" }
        : { icon: Box, label: "Shelf-stable" }
    : perishable
      ? { icon: Clock, label: "Perishable" }
      : null;

  // Audience tuning: the source line is redundant for a restaurant (it's them);
  // the → drop-off line is redundant for a drop-off (it's them).
  // Distance is only meaningful to a volunteer, and only once we actually know it
  // — an unshared location renders "—", so guard against a dangling "· — away".
  const showDistance =
    audience === "volunteer" && !!distance && distance !== "—" && distance !== "";
  const showSource = audience !== "restaurant";
  const showRoute = audience !== "dropoff";
  const sourceLabel = audience === "dropoff" ? `from ${source}` : source;

  // Status line — a clay "available <when>" cue for a scheduled listing, else the
  // semantic urgency word. Mono, color-coded, never a dot or a tinted chip.
  const statusLine = scheduled ? (
    <span
      aria-label={recurrence ? `recurs ${recurrence}` : `available ${availableLabel}`}
      className="font-mono text-[14px] font-semibold text-clay-800"
    >
      {recurrence ? (
        <span>Recurs {recurrence}</span>
      ) : (
        <span className="tabular-nums">Available {availableLabel}</span>
      )}
    </span>
  ) : (
    <span
      aria-label={spent ? "closed" : u.held ? u.word : `${u.word}, ${formatTimeLeft(minutesLeft, { long: true })} left`}
      className={cn("font-mono text-[14px] font-semibold", u.text)}
    >
      <span>{capitalize(u.word)}</span>
      {u.minutes != null && <span className="tabular-nums"> · {formatTimeLeft(u.minutes)}</span>}
    </span>
  );

  return (
    <article
      className={cn(
        "group flex animate-fade-up flex-row-reverse overflow-hidden rounded-3xl border border-neutral-200/70 bg-card shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift",
        className
      )}
    >
      {/* Photo as a fixed-width panel on the right, stretched to the body's
          height. No photo → the Meal Move mark as a contained brand placeholder. */}
      <Link
        href={`/listings/${id}`}
        aria-label={`View ${title}`}
        className={cn(
          "relative w-28 shrink-0 self-stretch overflow-hidden sm:w-44 lg:w-[232px]",
          isPlaceholder ? "bg-card" : "bg-neutral-100"
        )}
      >
        {isPlaceholder ? (
          <span
            aria-hidden
            className="absolute inset-8 bg-neutral-300 [mask:url(/mealmovelogo.png)_center/contain_no-repeat] [-webkit-mask:url(/mealmovelogo.png)_center/contain_no-repeat]"
          />
        ) : (
          <Image
            src={img}
            alt={title}
            fill
            sizes="232px"
            priority={priorityImage}
            className={cn(
              "object-cover transition-transform duration-300 group-hover:scale-[1.03]",
              spent && "opacity-75 saturate-[0.7]"
            )}
          />
        )}
      </Link>

      {/* Body — one quiet stack: status · title · source · facts · action. */}
      <div className="flex min-w-0 flex-1 flex-col justify-center p-6 sm:p-7">
        <div className="mb-2.5">{statusLine}</div>

        <h3 className="font-display text-[24px] font-medium leading-[1.18] tracking-tight text-balance sm:text-[27px]">
          <Link
            href={`/listings/${id}`}
            className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
          >
            {title}
          </Link>
        </h3>

        {showSource && (
          <p className="mt-2 flex items-center gap-1.5 text-[15px] font-medium text-neutral-700">
            <MapPin className="text-[0.95em] text-neutral-700" />
            {sourceLabel}
          </p>
        )}

        {/* Decision facts — one mono line; only the numbers carry weight + ink. */}
        <p className="mt-3.5 font-mono text-[15px] font-medium text-neutral-700">
          <span className="font-bold text-neutral-900">{servings}</span> servings
          {showDistance && (
            <>
              <span className="mx-1.5 text-neutral-300">·</span>
              <span className="font-bold text-neutral-900">{distance}</span> away
            </>
          )}
          {/* A big haul needs several cars. A volunteer decides on the open
              seats ("2 of 3 cars still needed"); a restaurant/admin watches the
              fill ("1 of 3 cars claimed"). */}
          {carsNeeded > 1 && (status === "open" || scheduled) && (
            <>
              <span className="mx-1.5 text-neutral-300">·</span>
              {audience === "volunteer" ? (
                claimedCount > 0 ? (
                  <>
                    <span className="font-bold text-neutral-900">
                      {carsNeeded - claimedCount} of {carsNeeded}
                    </span>{" "}
                    cars still needed
                  </>
                ) : (
                  <>
                    <span className="font-bold text-neutral-900">{carsNeeded}</span>{" "}
                    cars needed
                  </>
                )
              ) : claimedCount > 0 ? (
                <>
                  <span className="font-bold text-neutral-900">
                    {claimedCount} of {carsNeeded}
                  </span>{" "}
                  cars claimed
                </>
              ) : (
                <>
                  <span className="font-bold text-neutral-900">{carsNeeded}</span> cars
                  needed
                </>
              )}
            </>
          )}
        </p>

        {/* Scannability — food type + handling as calm labelled rows (no pills),
            so the feed reads by category at a glance. Each only when set. */}
        {(category || handling) && (
          <InfoRows
            className="mt-3"
            rows={[
              ...(category ? [{ label: "food", value: capitalize(category) }] : []),
              ...(handling
                ? [
                    {
                      label: "handling",
                      value: (
                        <span className="inline-flex items-center gap-1.5">
                          <handling.icon className="text-[0.95em] text-neutral-700" />
                          {handling.label}
                        </span>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}

        {dropOff && showRoute && (
          <p className="mt-2 flex items-start gap-1.5 text-[15px] text-clay-800">
            <ArrowRight className="mt-1 shrink-0 text-clay-400" />
            {/* Spent listings drop the badge: whether the drop-off happens to be
                open right now says nothing about a rescue that already ended. */}
            <DropOffName
              name={dropOff}
              hours={SPENT.includes(status) ? undefined : listing.dropOffHours}
            />
          </p>
        )}

        {audience === "restaurant" &&
          status === "open" &&
          !scheduled &&
          nearbyVolunteers != null && (
            <NearbyVolunteers variant="inline" count={nearbyVolunteers} className="mt-2.5" />
          )}

        {/* Action — for an open listing, a full-width link to the full details
            page (where the claim happens); a calm "opens <when>" cue for a
            scheduled one; otherwise the live status + who has it. */}
        <div className="mt-5">
          {scheduled ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-clay-50 px-3 py-1 font-mono text-[13px] text-clay-800">
              <Clock className="text-[0.95em]" />
              opens {availableLabel}
            </span>
          ) : status === "open" && claimable ? (
            <Link
              href={`/listings/${id}`}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-5 py-2.5 text-[16px] font-bold text-neutral-50 shadow-card transition-all duration-200",
                "hover:-translate-y-0.5 hover:bg-neutral-800 hover:shadow-lift active:translate-y-0 active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50"
              )}
            >
              More details
              <ArrowRight className="text-[0.95em]" />
            </Link>
          ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <StatusBadge status={status} />
              {buddyName && (
                <span className="rounded-full bg-rescued-50 px-2 py-0.5 font-mono text-[13px] text-rescued-800">
                  +1 buddy
                </span>
              )}
              {claimedBy && (
                <span className="truncate text-[15px] text-neutral-700">by {claimedBy}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
