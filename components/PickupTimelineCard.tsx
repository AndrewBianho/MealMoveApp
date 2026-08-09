"use client";

import Link from "next/link";
import Image from "next/image";
import { cn } from "./cn";
import { MapPin, ArrowRight } from "./icons";
import { StatusBadge } from "./StatusBadge";
import { OpenInMapsButton } from "./OpenInMapsButton";
import { RescueProgress } from "./RescueProgress";
import { RescueAdvancePanel } from "./RescueAdvancePanel";
import { isLiveOwnRescue, isTerminal } from "@/lib/rescueProgress";
import type { Listing, VolunteerImpact } from "@/lib/types";

// The "My pickups" card — one pickup's full story told through a horizontal
// lifecycle timeline (Posted → Claimed → Picked up → Delivered) with per-step
// timestamps and a progress fill. Ported from the pickups-timeline design
// handoff: its prototype accent maps to `rescued`, and fonts to the app faces.
//
// By default the card only *reports* — the photo-gated advance lives on the
// listing detail page and the card links to it. With `inlineAdvance` (the feed's
// "your current rescue" slot) it also carries the advance itself, so the
// volunteer holding the food can shoot the photo without a page change; the
// detail page keeps everything else (releasing, buddies, chat, take-it-home).
//
// The timeline itself is `RescueProgress`, shared with the listing detail page
// so the arc a volunteer sees in the feed is the arc they see while working the
// rescue. The step vocabulary lives in lib/rescueProgress.

const DEFAULT_IMAGE = "/mealmovelogo.jpg";

// The tick in the "Delivered — thank you" outcome chip. Sized by the caller,
// unlike the fixed 9px checks inside the timeline's dots (RescueProgress).
function Check({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="9"
      height="9"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function PickupTimelineCard({
  listing,
  priorityImage = false,
  featured = false,
  inlineAdvance = false,
  onDelivered,
  className,
}: {
  listing: Listing;
  priorityImage?: boolean;
  /** Hero scale for the volunteer's single in-flight rescue at the top of the
   * feed — larger photo, title, padding and CTA so the priority action reads
   * above the browse cards. Past-pickup cards (impact page) stay default. */
  featured?: boolean;
  /** Carry the photo-gated advance in the card instead of linking out to it.
   * Only meaningful on the viewer's own in-flight rescue. */
  inlineAdvance?: boolean;
  /** Forwarded to the advance panel — see RescueAdvancePanel.onDelivered. */
  onDelivered?: (impact: VolunteerImpact) => void;
  className?: string;
}) {
  const { id, title, source, servings, status, dropOff, imageUrl } = listing;
  // Guarded rather than trusted: the advance only ever renders on a rescue the
  // viewer is actually carrying, whatever the caller passes.
  const advanceHere = inlineAdvance && isLiveOwnRescue(listing);

  const terminal = isTerminal(status);
  const delivered = status === "delivered";
  const heldOvernight = status === "taken home";
  const img = imageUrl ?? DEFAULT_IMAGE;
  const isPlaceholder = !imageUrl;

  // Destination line — verb tracks the stage; clay is the destination accent.
  const dest = dropOff ?? "the drop-off";
  const route = terminal
    ? dropOff
      ? `Was headed to ${dropOff}`
      : null
    : delivered
      ? `Delivered to ${dest}`
      : heldOvernight
        ? `Held overnight — deliver to ${dest}`
        : status === "in transit"
          ? `On the way to ${dest}`
          : `For ${dest}`;

  const actionLabel =
    status === "claimed" ? "I've picked it up" : "Mark as delivered";

  return (
    <article
      className={cn(
        "group flex animate-fade-up overflow-hidden rounded-3xl border border-neutral-200/70 bg-card shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift",
        // Side-by-side everywhere, except the advance card on a phone: a photo
        // dropzone can't share 414px with a 40%-wide food photo (the tracker
        // labels collide and the capture buttons burst their dashed box). There
        // the photo becomes a banner and the body gets the full width.
        advanceHere ? "flex-col sm:flex-row-reverse" : "flex-row-reverse",
        className
      )}
    >
      {/* Photo panel on the right, status pill floating over it. */}
      <Link
        href={`/listings/${id}`}
        aria-label={`View ${title}`}
        className={cn(
          "relative shrink-0 self-stretch overflow-hidden",
          advanceHere && "h-36 w-full sm:h-auto",
          featured ? "sm:w-52 lg:w-[300px]" : "sm:w-44 lg:w-[212px]",
          !advanceHere && (featured ? "w-32" : "w-28"),
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
            sizes={featured ? "300px" : "212px"}
            priority={priorityImage}
            className={cn(
              "object-cover transition-transform duration-300 group-hover:scale-[1.03]",
              (terminal || delivered) && "opacity-75 saturate-[0.7]"
            )}
          />
        )}
        <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-card/95 px-2.5 py-1 shadow-card backdrop-blur-sm">
          <StatusBadge status={status} />
        </span>
      </Link>

      {/* Body */}
      <div className={cn("flex min-w-0 flex-1 flex-col", featured ? "p-6 sm:p-8" : "p-5 sm:p-6")}>
        <h3
          className={cn(
            "font-display font-medium leading-[1.18] tracking-tight text-balance",
            featured ? "text-[26px] sm:text-[30px]" : "text-[24px] sm:text-[24px]"
          )}
        >
          <Link
            href={`/listings/${id}`}
            className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
          >
            {title}
          </Link>
        </h3>

        <p className="mt-2 flex items-center gap-1.5 text-[15px] font-medium text-neutral-700">
          <MapPin className="text-[0.95em] text-neutral-700" />
          {source}
          <span className="text-neutral-300">·</span>
          <span className="font-mono">
            <span className="font-bold text-neutral-900">{servings}</span> servings
          </span>
        </p>

        {route && (
          <p
            className={cn(
              "mt-2.5 flex items-center gap-1.5 text-[15px] font-semibold",
              terminal ? "text-neutral-700" : heldOvernight ? "text-transit-800" : "text-clay-800"
            )}
          >
            <ArrowRight className="shrink-0 text-[1.05em]" />
            {route}
          </p>
        )}

        {advanceHere ? (
          // The volunteer is carrying this one: tracker, step counter and the
          // photo that advances it, right here. OpenInMaps stays alongside so
          // the route is still one tap from the card.
          <>
            <RescueAdvancePanel
              listing={listing}
              onDelivered={onDelivered}
              className="mt-5"
            />
            <OpenInMapsButton
              pickup={
                listing.lat != null && listing.lng != null
                  ? { lat: listing.lat, lng: listing.lng }
                  : null
              }
              dropOff={
                listing.dropOffLat != null && listing.dropOffLng != null
                  ? { lat: listing.dropOffLat, lng: listing.dropOffLng }
                  : null
              }
              className="mt-3 py-2 text-[15px]"
            />
          </>
        ) : (
          <>
            <RescueProgress listing={listing} className="mt-5" />

            {/* Action: in-flight → one full-width link to the detail page, labelled
                by stage (the photo-gated advance lives there); ended → a quiet
                outcome chip. */}
            <div className="mt-4">
              {!terminal && !delivered ? (
                <div className="flex flex-col gap-2">
                  <Link
                    href={`/listings/${id}`}
                    className={cn(
                      "block w-full rounded-2xl px-4 text-center font-bold transition-all duration-200",
                      featured ? "py-3 text-[16px]" : "py-2 text-[15px]",
                      "bg-gradient-to-b from-rescued-400 to-rescued-600 text-white shadow-glow hover:-translate-y-0.5 hover:shadow-lift",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50"
                    )}
                  >
                    {actionLabel}
                  </Link>
                  <OpenInMapsButton
                    pickup={
                      listing.lat != null && listing.lng != null
                        ? { lat: listing.lat, lng: listing.lng }
                        : null
                    }
                    dropOff={
                      listing.dropOffLat != null && listing.dropOffLng != null
                        ? { lat: listing.dropOffLat, lng: listing.dropOffLng }
                        : null
                    }
                    className="py-2 text-[15px]"
                  />
                </div>
              ) : delivered ? (
                <p className="flex items-center justify-center gap-2 rounded-2xl bg-rescued-50 px-4 py-2.5 text-[15px] font-semibold text-rescued-800">
                  <Check className="h-3.5 w-3.5" />
                  Delivered — thank you
                </p>
              ) : (
                <p className="flex items-center justify-center gap-2 rounded-2xl bg-neutral-100 px-4 py-2.5 text-[15px] font-medium text-neutral-700">
                  {status === "expired"
                    ? "This one closed before it could be rescued."
                    : "This one didn't make it — thanks for trying."}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </article>
  );
}
