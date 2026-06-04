import Link from "next/link";
import Image from "next/image";
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
    imageUrl,
  } = listing;

  const spent = ["delivered", "expired", "failed"].includes(status);

  return (
    <div className="group animate-fade-up overflow-hidden rounded-2xl border border-neutral-900/5 bg-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <div className={cn("h-1.5", stripColor(listing))} />

      {imageUrl && (
        <Link href={`/listings/${id}`} className="block">
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-neutral-100">
            <Image
              src={imageUrl}
              alt={title}
              fill
              sizes="(max-width: 640px) 100vw, 400px"
              className={cn(
                "object-cover transition-transform duration-300 group-hover:scale-[1.03]",
                spent && "opacity-75 saturate-[0.7]"
              )}
            />
          </div>
        </Link>
      )}

      <div className="p-4">
        <div className="mb-3">
          <h3 className="text-lg font-semibold leading-snug">
            <Link
              href={`/listings/${id}`}
              className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-transit-400"
            >
              {title}
            </Link>
          </h3>
        </div>

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 font-sans text-[13px] text-neutral-600">
            <MapPin className="text-neutral-400" />
            {source}
          </p>
          <p className="flex items-center gap-1.5 font-sans text-[13px] text-neutral-600">
            <Clock className="text-neutral-400" />
            {spent ? `closed ${expiresAt}` : `expires ${expiresAt} · ${minutesLeft} min`}
          </p>
          <p className="flex items-center gap-1.5 font-sans text-[13px] text-neutral-600">
            <Users className="text-neutral-400" />~{servings} servings
          </p>
          {dropOff && (
            <p className="flex items-center gap-1.5 font-sans text-[13px] text-neutral-600">
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
        <span className="font-sans text-[13px] text-neutral-600">
          {claimedBy && status !== "open" ? `by ${claimedBy}` : distance}
        </span>
      </div>
    </div>
  );
}
