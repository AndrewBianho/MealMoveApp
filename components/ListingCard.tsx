import Link from "next/link";
import Image from "next/image";
import { cn } from "./cn";
import { Clock, MapPin, ArrowRight } from "./icons";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";
import { NearbyVolunteers } from "./NearbyVolunteers";
import type { Listing } from "@/lib/types";

export type ListingCardAudience = "volunteer" | "restaurant" | "dropoff";

interface ListingCardProps {
  listing: Listing;
  /** When provided and the listing is open, the body shows a claim button. */
  onClaim?: (id: string) => void;
  /** Who's viewing — tunes which facts/lines show. Defaults to the volunteer view. */
  audience?: ListingCardAudience;
  /** Volunteers active near the pickup. Shown to the restaurant on open cards as
   *  a "will someone show up?" signal. */
  nearbyVolunteers?: number;
  /** Extra classes on the root — used for staggered entrance delays in the feed. */
  className?: string;
}

const SPENT: Listing["status"][] = ["delivered", "expired", "failed"];

// Listings without their own (or their restaurant's) photo fall back to the
// Meal Move logo, shown as a contained brand placeholder rather than a crop.
const DEFAULT_IMAGE = "/mealmovelogo.jpg";

// Urgency reads as one quiet status line at the top of the body — a colored dot
// + a mono word + the literal minutes ("closing soon · 6m"). Pairing the hue
// with a word AND the minutes keeps it legible without color (color-blind-safe),
// and the dot-only treatment (no tinted fill) keeps the card calm. Ramp text is
// the 800 stop for contrast; the dot is the 600. Bands: open (35m+) · soon
// (10–35) · closing soon (<10) · closed (spent) · taken home (deferred).
function urgency(listing: Listing) {
  if (SPENT.includes(listing.status)) {
    return { dot: "bg-neutral-400", text: "text-neutral-600", word: "closed", minutes: null, soon: false, held: true };
  }
  if (listing.status === "taken home") {
    return { dot: "bg-transit-600", text: "text-transit-800", word: "taken home", minutes: null, soon: false, held: true };
  }
  const m = listing.minutesLeft;
  if (m < 10) {
    return { dot: "bg-failed-600", text: "text-failed-800", word: "closing soon", minutes: m, soon: true, held: false };
  }
  if (m < 35) {
    return { dot: "bg-urgent-600", text: "text-urgent-800", word: "soon", minutes: m, soon: false, held: false };
  }
  return { dot: "bg-rescued-600", text: "text-rescued-800", word: "open", minutes: m, soon: false, held: false };
}

export function ListingCard({
  listing,
  onClaim,
  audience = "volunteer",
  nearbyVolunteers,
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
    recurrence,
    tempHandling,
    perishable,
  } = listing;

  const scheduled = !!listing.scheduled;
  const spent = SPENT.includes(status);
  const u = urgency(listing);
  const img = imageUrl ?? DEFAULT_IMAGE;
  const isPlaceholder = !imageUrl;

  // Handling cue — "what do I need to bring, how much time do I really have?".
  // Temp handling answers it directly; perishable is the fallback flag. Kept as
  // calm neutral metadata so it never competes with the urgency signal.
  const handling = tempHandling
    ? tempHandling === "hot"
      ? "keep hot"
      : tempHandling === "cold"
        ? "keep cold"
        : "shelf-stable"
    : perishable
      ? "perishable"
      : null;

  // Audience tuning: distance is only meaningful to a volunteer; the source line
  // is redundant for a restaurant (it's them); the → drop-off line is redundant
  // for a drop-off admin (it's them).
  const showDistance = audience === "volunteer";
  const showSource = audience !== "restaurant";
  const showRoute = audience !== "dropoff";
  const sourceLabel = audience === "dropoff" ? `from ${source}` : source;

  // Status line — a clay "available <when>" cue for a scheduled listing, else the
  // semantic urgency band. Calm dot + mono label, never a tinted chip.
  const statusLine = scheduled ? (
    <span
      aria-label={recurrence ? `recurs ${recurrence}` : `available ${availableLabel}`}
      className="inline-flex items-center gap-2 font-mono text-[12px] font-semibold text-clay-800"
    >
      <span className="h-[7px] w-[7px] rounded-full bg-clay-600" aria-hidden="true" />
      {recurrence ? (
        <span>recurs {recurrence}</span>
      ) : (
        <span className="tabular-nums">available {availableLabel}</span>
      )}
    </span>
  ) : (
    <span
      aria-label={spent ? "closed" : u.held ? u.word : `${u.word}, ${minutesLeft} minutes left`}
      className={cn("inline-flex items-center gap-2 font-mono text-[12px] font-semibold", u.text)}
    >
      <span
        className={cn("h-[7px] w-[7px] rounded-full", u.dot, u.soon && "motion-safe:animate-pulse")}
        aria-hidden="true"
      />
      <span>{u.word}</span>
      {u.minutes != null && <span className="tabular-nums">· {u.minutes}m</span>}
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
            className={cn(
              "object-cover transition-transform duration-300 group-hover:scale-[1.03]",
              spent && "opacity-75 saturate-[0.7]"
            )}
          />
        )}
      </Link>

      {/* Body — one quiet stack: status · title · source · facts · action. */}
      <div className="flex min-w-0 flex-1 flex-col justify-center p-5 sm:p-6">
        <div className="mb-2.5">{statusLine}</div>

        <h3 className="font-display text-[22px] font-medium leading-[1.18] tracking-tight text-balance sm:text-[25px]">
          <Link
            href={`/listings/${id}`}
            className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
          >
            {title}
          </Link>
        </h3>

        {showSource && (
          <p className="mt-2 flex items-center gap-1.5 text-[13.5px] font-medium text-neutral-500">
            <MapPin className="text-[0.95em] text-neutral-400" />
            {sourceLabel}
          </p>
        )}

        {/* Decision facts — one mono line; only the numbers carry weight + ink. */}
        <p className="mt-3.5 font-mono text-[14px] font-medium text-neutral-600">
          <span className="font-bold text-neutral-900">{servings}</span> servings
          {showDistance && (
            <>
              <span className="mx-1.5 text-neutral-300">·</span>
              <span className="font-bold text-neutral-900">{distance}</span> away
            </>
          )}
        </p>

        {/* Scannability — food type + handling, so the feed reads by category at
            a glance. Calm neutral metadata (no status hue), each only when set. */}
        {(category || handling) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {category && (
              <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 font-mono text-[11px] text-neutral-700">
                {category}
              </span>
            )}
            {handling && (
              <span className="rounded-full border border-neutral-200 px-2.5 py-0.5 font-mono text-[11px] text-neutral-600">
                {handling}
              </span>
            )}
          </div>
        )}

        {dropOff && showRoute && (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-clay-800">
            <ArrowRight className="text-clay-400" />
            {dropOff}
          </p>
        )}

        {notes && (
          <p className="mt-2.5 line-clamp-3 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-800">
            {notes}
          </p>
        )}

        {audience === "restaurant" &&
          status === "open" &&
          !scheduled &&
          nearbyVolunteers != null && (
            <NearbyVolunteers variant="inline" count={nearbyVolunteers} className="mt-2.5" />
          )}

        {/* Action — full-width claim for an open listing; a calm "opens <when>"
            cue for a scheduled one; otherwise the live status + who has it. */}
        <div className="mt-5">
          {scheduled ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-clay-50 px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-clay-800">
              <Clock className="text-[0.95em]" />
              opens {availableLabel}
            </span>
          ) : status === "open" && onClaim ? (
            <Button variant="claim" className="w-full" onClick={() => onClaim(id)}>
              Claim pickup
            </Button>
          ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <StatusBadge status={status} />
              {buddyName && (
                <span className="rounded-full bg-rescued-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-rescued-800">
                  +1 buddy
                </span>
              )}
              {claimedBy && (
                <span className="truncate text-[13px] text-neutral-500">by {claimedBy}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
