import Link from "next/link";
import Image from "next/image";
import { cn } from "./cn";
import { Clock, MapPin, ArrowRight, Calendar } from "./icons";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";
import type { Listing } from "@/lib/types";

export type ListingCardAudience = "volunteer" | "restaurant" | "dropoff";

interface ListingCardProps {
  listing: Listing;
  /** When provided and the listing is open, the footer shows a claim button. */
  onClaim?: (id: string) => void;
  /** Who's viewing — tunes which facts/lines show. Defaults to the volunteer view. */
  audience?: ListingCardAudience;
  /** Extra classes on the root — used for staggered entrance delays in the feed. */
  className?: string;
}

const SPENT: Listing["status"][] = ["delivered", "expired", "failed"];

// Listings without their own (or their restaurant's) photo fall back to the
// Meal Move logo, shown as a contained brand placeholder rather than a crop.
const DEFAULT_IMAGE = "/mealmovelogo.jpg";

// Urgency is shown as one filled color pill on the card itself (ramp-50 fill +
// ramp-800 text — the project's status-badge pattern), pairing the hue with a
// word and the literal minutes so it never relies on color alone
// (color-blind-safe). Bands: open (35m+) · soon (10–35) · closing soon (<10) ·
// closed (spent). This replaces the old top color strip + the separate "time
// left" legend — each card now carries its own labelled band.
function urgency(listing: Listing) {
  if (SPENT.includes(listing.status)) {
    return { fill: "bg-neutral-100 text-neutral-700", word: "closed", minutes: null, soon: false };
  }
  const m = listing.minutesLeft;
  if (m < 10) {
    return { fill: "bg-failed-50 text-failed-800", word: "closing soon", minutes: m, soon: true };
  }
  if (m < 35) {
    return { fill: "bg-urgent-50 text-urgent-800", word: "soon", minutes: m, soon: false };
  }
  return { fill: "bg-rescued-50 text-rescued-800", word: "open", minutes: m, soon: false };
}

export function ListingCard({
  listing,
  onClaim,
  audience = "volunteer",
  className,
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
    notes,
    imageUrl,
    minutesLeft,
    availableLabel,
  } = listing;

  // A future/scheduled listing reads calm — it's not claimable yet, so it gets
  // the clay secondary accent and a "available <when>" cue, never a status hue
  // or a live countdown.
  const scheduled = !!listing.scheduled;
  const spent = SPENT.includes(status);
  const u = urgency(listing);
  const img = imageUrl ?? DEFAULT_IMAGE;
  const isPlaceholder = !imageUrl;

  // Audience tuning: distance is only meaningful to a volunteer; the source line
  // is redundant for a restaurant (it's them); the → drop-off line is redundant
  // for a drop-off admin (it's them).
  const showDistance = audience === "volunteer";
  const showSource = audience !== "restaurant";
  const showRoute = audience !== "dropoff";
  const sourceLabel = audience === "dropoff" ? `from ${source}` : source;

  // The single color pill that lives on the card. Scheduled listings get a calm
  // clay "available <when>" pill; everything else gets its urgency band.
  const pill = scheduled ? (
    <span
      aria-label={`available ${availableLabel}`}
      className="inline-flex items-center gap-1.5 rounded-full bg-clay-50 px-2.5 py-1 font-mono text-[11px] text-clay-800"
    >
      <Calendar className="text-[0.95em]" />
      <span className="font-semibold">available</span>
      <span className="tabular-nums">{availableLabel}</span>
    </span>
  ) : (
    <span
      aria-label={spent ? "closed" : `${u.word}, ${minutesLeft} minutes left`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px]",
        u.fill,
        u.soon && "motion-safe:animate-pulse"
      )}
    >
      {spent ? (
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-400" aria-hidden="true" />
      ) : (
        <Clock className="text-[0.95em]" />
      )}
      <span className="font-semibold">{u.word}</span>
      {u.minutes != null && <span className="tabular-nums">{u.minutes}m</span>}
    </span>
  );

  return (
    <div
      className={cn(
        "group animate-fade-up overflow-hidden rounded-2xl border border-neutral-900/5 bg-card shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lift",
        className
      )}
    >
      <div className="flex">
        <div className="min-w-0 flex-1 p-4">
          <div className="mb-2">{pill}</div>
          <h3 className="text-xl font-semibold leading-snug">
            <Link
              href={`/listings/${id}`}
              className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
            >
              {title}
            </Link>
          </h3>

          {/* Tier 2 — the decision facts, promoted out of the gray row-stack into
              one emphasized mono line. Volunteers get servings · distance; other
              audiences see servings alone (distance isn't meaningful to them). */}
          <div className="mt-3 flex items-baseline gap-3 font-mono">
            <span className="text-neutral-900">
              <span className="text-lg font-semibold">{servings}</span>
              <span className="ml-1 text-[11px] text-neutral-700">servings</span>
            </span>
            {showDistance && (
              <>
                <span className="text-neutral-500">·</span>
                <span className="text-neutral-900">
                  <span className="text-base font-semibold">{distance}</span>
                  <span className="ml-1 text-[11px] text-neutral-700">away</span>
                </span>
              </>
            )}
          </div>

          {/* Tier 3 — supporting context. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 font-sans text-[13px] text-neutral-700">
            {category && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
                {category}
              </span>
            )}
            {showSource && (
              <span className="flex items-center gap-1.5">
                <MapPin className="text-neutral-600" />
                {sourceLabel}
              </span>
            )}
          </div>

          {dropOff && showRoute && (
            <p className="mt-1.5 flex items-center gap-1.5 font-sans text-[13px] text-clay-800">
              <ArrowRight className="text-clay-400" />
              {dropOff}
            </p>
          )}

          {notes && (
            // Clamp on the card so a full special-needs paragraph stays
            // scannable; the listing detail shows it in full.
            <p className="mt-2 line-clamp-3 rounded-md bg-neutral-100 px-2.5 py-1.5 text-xs text-neutral-800">
              {notes}
            </p>
          )}
        </div>

        {/* Photo sits as a fixed-width panel on the card's right, stretched to
            the content's height. No photo → the Meal Move logo as a contained
            brand placeholder. */}
        <Link
          href={`/listings/${id}`}
          className={cn(
            "relative w-28 shrink-0 self-stretch overflow-hidden sm:w-32",
            isPlaceholder ? "bg-card" : "bg-neutral-100"
          )}
        >
          {isPlaceholder ? (
            // No photo → the brand mark as a faint, themed silhouette (CSS mask
            // filled with a muted ink) that blends into the card surface.
            <span
              aria-hidden
              className="absolute inset-6 bg-neutral-300 [mask:url(/mealmovelogo.png)_center/contain_no-repeat] [-webkit-mask:url(/mealmovelogo.png)_center/contain_no-repeat]"
            />
          ) : (
            <Image
              src={img}
              alt={title}
              fill
              sizes="160px"
              className={cn(
                "object-cover transition-transform duration-300 group-hover:scale-[1.03]",
                spent && "opacity-75 saturate-[0.7]"
              )}
            />
          )}
        </Link>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-200/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {scheduled ? (
            // Locked until it goes live — a calm, non-actionable cue, not a
            // disabled claim button (which would read as "broken").
            <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-neutral-700">
              <Clock className="text-[0.95em]" />
              opens {availableLabel}
            </span>
          ) : status === "open" && onClaim ? (
            <Button variant="claim" onClick={() => onClaim(id)}>
              Claim pickup
            </Button>
          ) : (
            <>
              <StatusBadge status={status} />
              {buddyName && (
                <span className="rounded-full bg-rescued-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-rescued-800">
                  +1 buddy
                </span>
              )}
              {claimedBy && (
                <span className="truncate font-sans text-[13px] text-neutral-700">
                  by {claimedBy}
                </span>
              )}
            </>
          )}
        </div>

        {/* Explicit "tap for more" affordance: the title and photo already link
            to the detail, but a labelled clay link makes the whole card read as
            tappable — important for first-timers on a phone. */}
        <Link
          href={`/listings/${id}`}
          className="flex shrink-0 items-center gap-1 rounded-sm font-sans text-[13px] font-semibold text-neutral-700 transition-colors hover:text-neutral-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
        >
          Details
          <ArrowRight className="text-[0.95em] text-neutral-600" />
        </Link>
      </div>
    </div>
  );
}
