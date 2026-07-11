import Link from "next/link";
import Image from "next/image";
import { cn } from "./cn";
import { MapPin, ArrowRight } from "./icons";
import { StatusBadge } from "./StatusBadge";
import { OpenInMapsButton } from "./OpenInMapsButton";
import type { Listing } from "@/lib/types";

// The "My pickups" card — one pickup's full story told through a horizontal
// lifecycle timeline (Posted → Claimed → Picked up → Delivered) with per-step
// timestamps and a progress fill. Ported from the pickups-timeline design
// handoff: its prototype accent maps to `rescued`, fonts to the app faces, and
// the confirm-gated inline advance became a single stage-labelled link to the
// listing detail page — full details and the photo-gated advance both live
// there, so the card never advances a claim (or forks the details) in place.

const STEPS = ["Posted", "Claimed", "Picked up", "Delivered"] as const;

// Progress fill spans dot-center to dot-center: full span is 75% of the row
// (12.5% inset each side), so each completed step adds a quarter of the row.
const FILL: Record<number, string> = { 0: "w-0", 1: "w-1/4", 2: "w-2/4", 3: "w-3/4" };

const DEFAULT_IMAGE = "/mealmovelogo.jpg";

/** Furthest lifecycle step reached (0 posted · 1 claimed · 2 picked up · 3 delivered). */
function progressOf(l: Listing): number {
  switch (l.status) {
    case "claimed":
      return 1;
    case "in transit":
    case "taken home": // a pause within in-transit, not its own stage
      return 2;
    case "delivered":
      return 3;
    case "expired":
    case "failed":
      // Unhappy end — freeze at whatever was actually reached.
      return l.deliveredAt ? 3 : l.pickedUpAt || l.photoAtPickupUrl ? 2 : l.claimedAt ? 1 : 0;
    default:
      return 0;
  }
}

// "1:05 PM" today, "Thu, 1:05 PM" otherwise — same recipe as deliverBy labels.
function stamp(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}

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
  className,
}: {
  listing: Listing;
  priorityImage?: boolean;
  /** Hero scale for the volunteer's single in-flight rescue at the top of the
   * feed — larger photo, title, padding and CTA so the priority action reads
   * above the browse cards. Past-pickup cards (impact page) stay default. */
  featured?: boolean;
  className?: string;
}) {
  const { id, title, source, servings, status, dropOff, imageUrl } = listing;

  const progress = progressOf(listing);
  const terminal = status === "expired" || status === "failed";
  const delivered = status === "delivered";
  const heldOvernight = status === "taken home";
  const img = imageUrl ?? DEFAULT_IMAGE;
  const isPlaceholder = !imageUrl;

  const times = [listing.postedAt, listing.claimedAt, listing.pickedUpAt, listing.deliveredAt];

  const deliverByLabel = listing.deliverBy
    ? new Date(listing.deliverBy).toLocaleString([], {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

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
        "group flex animate-fade-up flex-row-reverse overflow-hidden rounded-3xl border border-neutral-200/70 bg-card shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift",
        className
      )}
    >
      {/* Photo panel on the right, status pill floating over it. */}
      <Link
        href={`/listings/${id}`}
        aria-label={`View ${title}`}
        className={cn(
          "relative shrink-0 self-stretch overflow-hidden",
          featured ? "w-32 sm:w-52 lg:w-[300px]" : "w-28 sm:w-44 lg:w-[212px]",
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

        {/* Lifecycle timeline — times over dots over labels, all on the same
            four equal columns; the fill runs dot-center to dot-center. */}
        <div
          aria-label={`Pickup progress: ${status}`}
          className="mt-5 rounded-2xl border border-neutral-200/60 bg-neutral-50 px-2 pb-2 pt-3.5 sm:px-3.5"
        >
          <div className="flex">
            {STEPS.map((name, i) => (
              <div
                key={name}
                className={cn(
                  "min-h-[12px] flex-1 text-center font-mono text-[10.5px] font-bold tabular-nums",
                  i <= progress ? "text-neutral-900" : "text-neutral-700"
                )}
              >
                {i <= progress ? stamp(times[i]) : ""}
              </div>
            ))}
          </div>

          <div className="relative my-2 flex items-center">
            <div
              aria-hidden
              className="absolute inset-x-[12.5%] top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-neutral-200"
            />
            <div
              aria-hidden
              className={cn(
                "absolute left-[12.5%] top-1/2 h-[3px] -translate-y-1/2 rounded-full transition-[width] duration-300",
                terminal ? "bg-neutral-300" : "bg-rescued-600",
                FILL[progress]
              )}
            />
            {STEPS.map((name, i) => {
              const done = i <= progress;
              const active = !terminal && !delivered && i === progress + 1;
              return (
                <div key={name} className="relative z-[1] flex flex-1 justify-center">
                  <span className="relative flex h-4 w-4 items-center justify-center">
                    {active && (
                      <span
                        aria-hidden
                        className="absolute -inset-1 rounded-full bg-rescued-400/25 motion-safe:animate-pulse"
                      />
                    )}
                    <span
                      className={cn(
                        "relative flex h-4 w-4 items-center justify-center rounded-full border-2 text-white",
                        done
                          ? terminal
                            ? "border-neutral-400 bg-neutral-400"
                            : "border-rescued-600 bg-rescued-600"
                          : active
                            ? "border-rescued-400 bg-card"
                            : "border-neutral-200 bg-card"
                      )}
                    >
                      {done && <Check />}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          {/* Labels share the four equal columns with the dots above. On a
              narrow phone the columns get tight (the photo panel eats width),
              so the label steps down a size and keeps a hair of side padding —
              centered on its dot, but never touching its neighbour. */}
          <div className="flex">
            {STEPS.map((name) => (
              <div
                key={name}
                className="flex-1 px-0.5 text-center text-[11px] font-semibold leading-tight text-neutral-700 sm:text-[13px]"
              >
                {name}
              </div>
            ))}
          </div>

          {heldOvernight && (
            <p className="mt-2 text-center font-mono text-[13px] text-transit-800">
              Held overnight{deliverByLabel ? ` · deliver by ${deliverByLabel}` : ""}
            </p>
          )}
        </div>

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
      </div>
    </article>
  );
}
