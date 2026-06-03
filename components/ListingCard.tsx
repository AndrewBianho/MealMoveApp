import Link from "next/link";
import { cn } from "./cn";
import { Clock, MapPin, Users } from "./icons";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";
import type { Listing } from "@/lib/types";

interface ListingCardProps {
  listing: Listing;
  /** When provided and the listing is open, the footer shows a claim button. */
  onClaim?: (id: string) => void;
}

// red <10 min, amber <35 min, green otherwise. Delivered/expired/failed read
// as spent, so they show a neutral strip rather than a false "plenty of time".
function stripColor(listing: Listing): string {
  if (["delivered", "expired", "failed"].includes(listing.status)) {
    return "bg-neutral-200";
  }
  if (listing.minutesLeft < 10) return "bg-failed-400";
  if (listing.minutesLeft < 35) return "bg-urgent-400";
  return "bg-rescued-400";
}

export function ListingCard({ listing, onClaim }: ListingCardProps) {
  const {
    id,
    title,
    source,
    expiresAt,
    minutesLeft,
    servings,
    distance,
    status,
    claimedBy,
    dropOff,
    notes,
  } = listing;

  const spent = ["delivered", "expired", "failed"].includes(status);

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200/40 bg-white">
      <div className={cn("h-[3px]", stripColor(listing))} />

      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium">
            <Link
              href={`/listings/${id}`}
              className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-transit-400"
            >
              {title}
            </Link>
          </h3>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-neutral-400">
            {id}
          </span>
        </div>

        <div className="space-y-2">
          <p className="flex items-center gap-1 font-mono text-xs text-neutral-600">
            <MapPin className="text-neutral-400" />
            {source}
          </p>
          <p className="flex items-center gap-1 font-mono text-xs text-neutral-600">
            <Clock className="text-neutral-400" />
            {spent ? `closed ${expiresAt}` : `expires ${expiresAt} · ${minutesLeft} min`}
          </p>
          <p className="flex items-center gap-1 font-mono text-xs text-neutral-600">
            <Users className="text-neutral-400" />~{servings} servings
          </p>
          {dropOff && (
            <p className="flex items-center gap-1 font-mono text-xs text-neutral-600">
              <MapPin className="text-transit-400" />→ {dropOff}
            </p>
          )}
          {notes && (
            <p className="rounded-md bg-urgent-50 px-2 py-1 text-xs text-urgent-800">
              {notes}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-neutral-200/40 px-4 py-3">
        {status === "open" && onClaim ? (
          <Button variant="primary" onClick={() => onClaim(id)}>
            Claim pickup
          </Button>
        ) : (
          <StatusBadge status={status} />
        )}
        <span className="font-mono text-xs text-neutral-600">
          {claimedBy && status !== "open" ? `by ${claimedBy}` : distance}
        </span>
      </div>
    </div>
  );
}
