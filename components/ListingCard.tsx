import Link from "next/link";
import Image from "next/image";
import { cn } from "./cn";
import { Clock, MapPin, ArrowRight } from "./icons";
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
}

const SPENT: Listing["status"][] = ["delivered", "expired", "failed"];

// Listings without their own (or their restaurant's) photo fall back to the
// Meal Move logo, shown as a contained brand placeholder rather than a crop.
const DEFAULT_IMAGE = "/mealmovelogo.jpg";

// Urgency drives the top strip, the countdown chip, and (when very urgent) a
// ring. The chip always carries the clock icon + the literal minutes, so the
// signal never relies on hue alone (color-blind-safe). Spent listings read as
// neutral "closed" rather than a false countdown.
function urgency(listing: Listing) {
  if (SPENT.includes(listing.status)) {
    return {
      strip: "bg-neutral-200",
      chip: "bg-neutral-100 text-neutral-600 ring-neutral-900/5",
      label: "closed",
      soon: false,
    };
  }
  const m = listing.minutesLeft;
  if (m < 10) {
    return {
      strip: "bg-failed-400",
      chip: "bg-failed-50 text-failed-800 ring-failed-200",
      label: `${m}m`,
      soon: true,
    };
  }
  if (m < 35) {
    return {
      strip: "bg-urgent-400",
      chip: "bg-urgent-50 text-urgent-800 ring-urgent-200",
      label: `${m}m`,
      soon: false,
    };
  }
  return {
    strip: "bg-rescued-400",
    chip: "bg-rescued-50 text-rescued-800 ring-rescued-200",
    label: `${m}m`,
    soon: false,
  };
}

export function ListingCard({
  listing,
  onClaim,
  audience = "volunteer",
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
  } = listing;

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

  const chip = (
    <span
      aria-label={spent ? "closed" : `${minutesLeft} minutes left`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 ring-1",
        "font-mono text-xs font-medium",
        u.chip,
        u.soon && "motion-safe:animate-pulse"
      )}
    >
      <Clock className="text-[0.95em]" />
      {u.label}
    </span>
  );

  return (
    <div
      className={cn(
        "group animate-fade-up overflow-hidden rounded-2xl border border-neutral-900/5 bg-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift",
        u.soon && "ring-2 ring-failed-200"
      )}
    >
      <div className={cn("h-1.5", u.strip)} />

      <div className="flex">
        <div className="min-w-0 flex-1 p-4">
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
              <span className="ml-1 text-[11px] text-neutral-500">servings</span>
            </span>
            {showDistance && (
              <>
                <span className="text-neutral-300">·</span>
                <span className="text-neutral-900">
                  <span className="text-base font-semibold">{distance}</span>
                  <span className="ml-1 text-[11px] text-neutral-500">away</span>
                </span>
              </>
            )}
          </div>

          {/* Tier 3 — supporting context. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 font-sans text-[13px] text-neutral-600">
            {category && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
                {category}
              </span>
            )}
            {showSource && (
              <span className="flex items-center gap-1.5">
                <MapPin className="text-neutral-400" />
                {sourceLabel}
              </span>
            )}
          </div>

          {dropOff && showRoute && (
            <p className="mt-1.5 flex items-center gap-1.5 font-sans text-[13px] text-clay-600">
              <ArrowRight className="text-clay-400" />
              {dropOff}
            </p>
          )}

          {notes && (
            <p className="mt-2 rounded-md bg-urgent-50 px-2.5 py-1.5 text-xs text-urgent-800">
              {notes}
            </p>
          )}
        </div>

        {/* Photo sits as a fixed-width panel on the card's right, stretched to
            the content's height; the urgency chip overlays its top-right.
            No photo → the Meal Move logo as a contained brand placeholder. */}
        <Link
          href={`/listings/${id}`}
          className={cn(
            "relative w-28 shrink-0 self-stretch overflow-hidden sm:w-32",
            isPlaceholder ? "bg-neutral-50" : "bg-neutral-100"
          )}
        >
          <Image
            src={img}
            alt={isPlaceholder ? "Meal Move" : title}
            fill
            sizes="160px"
            className={cn(
              isPlaceholder
                ? "object-contain p-4 opacity-80"
                : "object-cover transition-transform duration-300 group-hover:scale-[1.03]",
              spent && "opacity-75 saturate-[0.7]"
            )}
          />
          <span className="absolute right-2 top-2 shadow-[0_2px_8px_-2px_rgba(40,30,10,0.35)]">
            {chip}
          </span>
        </Link>
      </div>

      <div className="flex items-center justify-between border-t border-neutral-200/40 px-4 py-3">
        {status === "open" && onClaim ? (
          <Button variant="primary" onClick={() => onClaim(id)}>
            Claim pickup
          </Button>
        ) : (
          <span className="flex items-center gap-2">
            <StatusBadge status={status} />
            {buddyName && (
              <span className="rounded-full bg-rescued-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-rescued-800">
                +1 buddy
              </span>
            )}
          </span>
        )}
        {claimedBy && status !== "open" && (
          <span className="font-sans text-[13px] text-neutral-600">
            by {claimedBy}
          </span>
        )}
      </div>
    </div>
  );
}
