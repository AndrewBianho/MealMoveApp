"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";
import { InfoRows } from "./InfoRows";
import { Toast, useToast } from "./Toast";
import { ArrowRight, Car, MapPin, Users, Flame, Snowflake, Box } from "./icons";
import { cn } from "./cn";
import {
  claimListing,
  markDelivered,
  startDelivery,
  takeHomeForTomorrow,
  cancelBuddyInvite,
  respondToBuddyInvite,
  releaseClaim,
  recordRescueAccuracy,
} from "@/app/actions";
import { NotificationPrimeCard } from "./NotificationPrimeCard";
import { ChatPanel } from "./ChatPanel";
import { Avatar } from "./Avatar";
import { BuddyInvitePicker } from "./BuddyInvitePicker";
import { ImageUploadField } from "./ImageUploadField";
import { OpenInMapsButton } from "./OpenInMapsButton";
import { SafetyChecklist } from "./SafetyChecklist";
import { RescueAccuracySignal } from "./RescueAccuracySignal";
import { startFailureReplay } from "@/lib/analytics/client";
import type { SafetyAnswers } from "@/lib/safety";
import type { RescueAccuracy } from "@/lib/accuracy";
import { OpenNowBadge } from "./RetrievalHoursDisplay";
import { DropOffNotices } from "./DropOffNotices";
import { RescueCelebration } from "./RescueCelebration";
import { currentDayKey, formatDay, isOpenNow } from "@/lib/hours";
import { formatTimeLeft } from "@/lib/time";
import { milesBetween } from "@/lib/geo";
import { trackClient } from "@/lib/analytics/client";
import type {
  DropOffChoice,
  DropOffNoticeView,
  Listing,
  ListingStatus,
  VolunteerImpact,
} from "@/lib/types";

// The happy-path journey. expired / failed are terminal off-ramps and render
// their own banner rather than a step.
const JOURNEY: ListingStatus[] = ["open", "claimed", "in transit", "delivered"];

// Lazy — keep Mapbox (and its CSS) out of the detail bundle on phones; the side
// map only exists at lg+, mirroring the feed's wide side-by-side layout.
const ListingsMap = dynamic(
  () => import("./ListingsMap").then((m) => m.ListingsMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full animate-pulse rounded-2xl border border-neutral-200/60 bg-neutral-100" />
    ),
  }
);
import type { MapDropOffPin, LiveRoute } from "./ListingsMap";

const STEP_LABEL: Record<string, string> = {
  open: "Posted",
  claimed: "Claimed",
  "in transit": "In transit",
  delivered: "Delivered",
};

// Progress fill spans dot-center to dot-center: the full span is 75% of the
// row (12.5% inset each side), so each completed step adds a quarter — the
// same geometry as PickupTimelineCard's timeline.
const STEP_FILL: Record<number, string> = { 0: "w-0", 1: "w-1/4", 2: "w-2/4", 3: "w-3/4" };

// "1:05 PM" today, "Thu, 1:05 PM" otherwise — matching the deliverBy labels.
function stepStamp(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function StepCheck() {
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
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const TEMP_LABEL: Record<NonNullable<Listing["tempHandling"]>, string> = {
  hot: "hot",
  cold: "cold",
  ambient: "at room temp",
};

function ProofPhoto({ label, url }: { label: string; url: string }) {
  return (
    <figure>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl">
        <Image src={url} alt={`Food ${label}`} fill sizes="200px" className="object-cover" />
      </div>
      <figcaption className="mt-1 font-mono text-[13px] text-neutral-700">
        {label}
      </figcaption>
    </figure>
  );
}

function MetaRow({
  icon,
  children,
  className,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("flex items-center gap-2 font-sans text-[15px] text-neutral-700", className)}>
      <span className="text-neutral-700">{icon}</span>
      {children}
    </p>
  );
}

export function ListingDetail({
  listing,
  viewerId,
  canChat = false,
  canClaim = true,
  incomingInvite = null,
  outgoingInvite = null,
  dropOffNotices = [],
  dropOffChoices = [],
  chosenDropOffPin = null,
  activeElsewhere = null,
  canPrimeNotifications = false,
}: {
  listing: Listing | null;
  viewerId?: string;
  canChat?: boolean;
  /** Org admins oversee but don't carry pickups — hide the claim affordance. */
  canClaim?: boolean;
  /** Volunteer hasn't enabled notifications or been prompted — show the one-time
   * prime card after they claim, the design's gentle anti-flaking on-ramp. */
  canPrimeNotifications?: boolean;
  /** A pending buddy invite addressed to the current viewer, if any. */
  incomingInvite?: { id: string; inviterName: string } | null;
  /** The primary's outstanding buddy invite, if one is awaiting a response. */
  outgoingInvite?: { inviteeName: string } | null;
  /** Active service notices for this listing's drop-off (closing early, etc.). */
  dropOffNotices?: DropOffNoticeView[];
  /** Eligible destinations for destination-first claiming, nearest first —
   * present while the listing is open and no drop-off has been chosen yet. */
  dropOffChoices?: DropOffChoice[];
  /** The already-chosen destination's pin, once a claim set it — the side map
   * shows it next to the pickup. */
  chosenDropOffPin?: MapDropOffPin | null;
  /** The viewer's live claim on another listing, if any. One rescue at a time:
   * while set, the claim flow here is replaced by a "finish that one first"
   * notice (the server action enforces the same rule). */
  activeElsewhere?: { listingId: string; title: string } | null;
}) {
  const { message, show } = useToast();
  const [isPending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmTakeHome, setConfirmTakeHome] = useState(false);
  // Set when this volunteer completes the delivery; renders the celebration.
  const [celebration, setCelebration] = useState<VolunteerImpact | null>(null);
  // One-time notification prime, surfaced right after a fresh claim.
  const [primeOpen, setPrimeOpen] = useState(false);
  // Dismissible food-safety checklist answers, captured with the pickup proof.
  const [safety, setSafety] = useState<SafetyAnswers>({});
  // Destination-first claiming: the drop-off the volunteer picked, required
  // before the claim can go through (null until they choose).
  const [chosenDropOff, setChosenDropOff] = useState<string | null>(null);

  // Destination-first: an open listing with no drop-off yet needs the volunteer
  // to pick one before claiming. Derived ahead of the null guard so the map
  // memos below satisfy the rules of hooks.
  const needsDropOff = Boolean(
    listing &&
      listing.status === "open" &&
      canClaim &&
      !activeElsewhere &&
      !listing.dropOffId
  );
  // Pins for the side map — the pickup plus either the destination choices
  // (while picking) or the already-chosen drop-off. Memoized so selecting a
  // choice restyles the halo instead of rebuilding the map.
  const mapListings = useMemo(() => (listing ? [listing] : []), [listing]);
  const mapDropOffs = useMemo<MapDropOffPin[]>(() => {
    if (needsDropOff) {
      return dropOffChoices.map((d) => ({ id: d.id, name: d.name, lat: d.lat, lng: d.lng }));
    }
    return chosenDropOffPin ? [chosenDropOffPin] : [];
  }, [needsDropOff, dropOffChoices, chosenDropOffPin]);
  // Hand the map the journey to draw a blue route + tracer along. The map
  // prepends the volunteer's current location, so on a live listing it shows
  // "you → pickup" as soon as they're located, and extends to "→ drop-off" once
  // a destination is chosen (a picker choice, or the committed drop-off in
  // transit) — redrawn in place as they switch. Terminal listings show nothing.
  const liveRoute = useMemo<LiveRoute | null>(() => {
    if (listing?.lat == null || listing?.lng == null) return null;
    if (["delivered", "expired", "failed"].includes(listing.status)) return null;
    let dropOff: [number, number] | null = null;
    if (chosenDropOffPin) {
      dropOff = [chosenDropOffPin.lng, chosenDropOffPin.lat];
    } else if (needsDropOff && chosenDropOff) {
      const d = dropOffChoices.find((c) => c.id === chosenDropOff);
      if (d) dropOff = [d.lng, d.lat];
    }
    return { pickup: [listing.lng, listing.lat], dropOff };
  }, [
    listing?.status,
    listing?.lat,
    listing?.lng,
    needsDropOff,
    chosenDropOff,
    dropOffChoices,
    chosenDropOffPin,
  ]);

  // Client intent events — fire once each, guarded by a ref so remounts of
  // dependent state (e.g. needsDropOff flipping) don't re-fire them.
  const firedListingOpened = useRef(false);
  const firedClaimFlowViewed = useRef(false);
  useEffect(() => {
    if (listing && listing.status === "open" && !firedListingOpened.current) {
      firedListingOpened.current = true;
      const band =
        listing.minutesLeft < 10 ? "closing_soon" : listing.minutesLeft < 35 ? "soon" : "open";
      trackClient("listing_opened", { listingId: listing.id, urgencyBand: band });
    }
  }, [listing?.status, listing?.minutesLeft, listing?.id]);
  useEffect(() => {
    if (needsDropOff && listing && !firedClaimFlowViewed.current) {
      firedClaimFlowViewed.current = true;
      trackClient("claim_flow_viewed", { listingId: listing.id });
    }
  }, [needsDropOff, listing?.id]);

  if (!listing) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 bg-card px-6 py-16 text-center">
        <p className="text-[16px] text-neutral-700">This listing isn&apos;t available.</p>
        <p className="mt-1 font-mono text-[13px] text-neutral-700">
          It may have been removed.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-[16px] font-medium text-rescued-600 hover:underline"
        >
          ← Back to the feed
        </Link>
      </div>
    );
  }

  const terminal = ["expired", "failed"].includes(listing.status);
  // taken_home is a pause within the in-transit step (food in hand, delivery
  // deferred to tomorrow), not its own journey stage — so the stepper still
  // reads open → claimed → in transit → delivered.
  const heldOvernight = listing.status === "taken home";
  const currentStep = JOURNEY.indexOf(heldOvernight ? "in transit" : listing.status);
  const id = listing.id;
  const deliverByLabel = listing.deliverBy
    ? new Date(listing.deliverBy).toLocaleString([], {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  // Per-step timestamps for the lifecycle stepper (nulls stay blank).
  const stepTimes = [
    listing.postedAt,
    listing.claimedAt,
    listing.pickedUpAt,
    listing.deliveredAt,
  ];
  // Whether the chosen drop-off is open right now — drives the closed pill,
  // the warning banner, and the in-transit guidance. null = no hours on file.
  const dropOffOpen = listing.dropOffHours ? isOpenNow(listing.dropOffHours) : null;
  // Straight-line pickup → drop-off miles for the route overlay on the map.
  const routeMiles =
    listing.lat != null && listing.lng != null && chosenDropOffPin
      ? milesBetween(listing.lat, listing.lng, chosenDropOffPin.lat, chosenDropOffPin.lng)
      : null;
  // Coordinates handed to the "Open in Google Maps" button — pickup (restaurant)
  // and the committed drop-off, so a claimed volunteer can navigate the rescue.
  const mapsPickup =
    listing.lat != null && listing.lng != null
      ? { lat: listing.lat, lng: listing.lng }
      : null;
  const mapsDropOff = chosenDropOffPin
    ? { lat: chosenDropOffPin.lat, lng: chosenDropOffPin.lng }
    : null;

  function onClaim() {
    startTransition(async () => {
      try {
        await claimListing(id, chosenDropOff ?? undefined);
        if (canPrimeNotifications) setPrimeOpen(true);
        show("Claimed — it's yours for the next fifteen minutes.");
      } catch (e) {
        show(e instanceof Error ? e.message : "Couldn't claim this pickup.");
      }
    });
  }
  function onPickupPhoto(url: string | null) {
    if (!url) return;
    startTransition(async () => {
      await startDelivery(id, url, safety);
      show("On your way — drive safe.");
    });
  }
  function onDeliveryPhoto(url: string | null) {
    if (!url) return;
    startTransition(async () => {
      const impact = await markDelivered(id, url);
      setCelebration(impact);
    });
  }
  function onRescueAccuracy(accuracy: RescueAccuracy, note: string) {
    startTransition(async () => {
      try {
        await recordRescueAccuracy(id, accuracy, note);
        show("Thanks — that helps us keep pickups dependable.");
      } catch {
        show("Couldn't save that just now.");
      }
    });
  }
  function onTakeHome() {
    startFailureReplay();
    startTransition(async () => {
      try {
        await takeHomeForTomorrow(id);
        setConfirmTakeHome(false);
        show("Saved for tomorrow — thanks for keeping it safe. 🌙");
      } catch {
        show("This pickup is no longer active.");
      }
    });
  }
  function onAcceptInvite() {
    if (!incomingInvite) return;
    startTransition(async () => {
      try {
        await respondToBuddyInvite(incomingInvite.id, true, id);
        show("You're on it together now. 🤝");
      } catch {
        show("This invite is no longer available.");
      }
    });
  }
  function onDeclineInvite() {
    if (!incomingInvite) return;
    startTransition(async () => {
      try {
        await respondToBuddyInvite(incomingInvite.id, false, id);
        show("No worries — declined.");
      } catch {
        show("This invite is no longer available.");
      }
    });
  }
  function onCancelInvite() {
    startTransition(async () => {
      try {
        await cancelBuddyInvite(id);
        show("Invite cancelled.");
      } catch {
        show("There's no invite to cancel.");
      }
    });
  }
  function onCancelPickup() {
    startFailureReplay();
    startTransition(async () => {
      try {
        await releaseClaim(id);
        show(
          listing!.iAmBuddy
            ? "Stepped off — your buddy still has it."
            : listing!.buddyName
              ? `Handed off to ${listing!.buddyName}.`
              : "Cancelled — back on the feed for someone else."
        );
        setConfirmCancel(false);
      } catch {
        show("This pickup is no longer active.");
      }
    });
  }

  // Buddy UI / coordination only matter while the pickup is being worked —
  // including while it's held overnight for a next-day delivery.
  const onClaimActive =
    listing.status === "claimed" ||
    listing.status === "in transit" ||
    listing.status === "taken home";
  const isPrimary = Boolean(listing.mine) && !listing.iAmBuddy;
  // Footer escape hatches: buddy invites while no buddy/invite exists; cancel
  // only while the claim can still be released (pre-photo, see checkins).
  const canInviteBuddy =
    isPrimary && !listing.buddyName && !outgoingInvite && !pickerOpen;
  const canCancel = listing.status === "claimed" && Boolean(listing.mine);

  // The one action this screen exists for. On phones the inline "Next step"
  // card sits below food safety / special requests / the status timeline, so a
  // fixed bar pins the claim button above the tab bar ("every screen moves
  // food" — the primary action never hides below the fold). md+ keeps only the
  // inline card.
  // No pinned mobile bar while blocked by another live claim — the "Next step"
  // card explains and links there instead of dangling a dead action.
  const showClaimBar = listing.status === "open" && canClaim && !activeElsewhere;
  // A listing whose destination is already set (another car on a multi-car
  // haul chose it) claims straight away; otherwise a choice must be made first.
  const claimReady = !needsDropOff || chosenDropOff != null;

  return (
    <div
      className={cn(
        isPending && "opacity-70 transition-opacity",
        showClaimBar && "pb-20 md:pb-0"
      )}
    >
      <Link
        href="/"
        className="-mx-1.5 mb-2 inline-block rounded px-1.5 py-2 text-[16px] text-neutral-700 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
      >
        ← Feed
      </Link>

      {primeOpen && (
        <div className="mb-4 animate-fade-in">
          <NotificationPrimeCard onDone={() => setPrimeOpen(false)} />
        </div>
      )}

      {incomingInvite && !listing.mine && onClaimActive && (
        <div className="mb-4 rounded-xl border border-rescued-200 bg-rescued-50 p-5">
          <p className="font-mono text-[13px] text-rescued-800">
            Buddy invite
          </p>
          <p className="mt-1 text-[16px] text-rescued-800">
            <span className="font-medium">{incomingInvite.inviterName}</span>{" "}
            invited you to buddy this pickup — do it together so neither of you
            has to flake.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              onClick={onAcceptInvite}
              disabled={isPending}
            >
              Join the pickup
            </Button>
            <Button
              variant="ghost"
              onClick={onDeclineInvite}
              disabled={isPending}
            >
              Not this time
            </Button>
          </div>
        </div>
      )}

      {/* Handoff layout: a narrow action panel on the left — stepper, facts,
          phase content, and actions in one stack — with the map filling the
          rest of the viewport at lg+. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,472px)_minmax(0,1fr)]">
        <div className="space-y-6">
      {/* Lifecycle stepper — the pickup's whole story in one horizontal bar on
          top of the panel: mono timestamps over dots over labels on four equal
          columns, the sage fill running dot-center to dot-center
          (PickupTimelineCard's timeline recipe). Terminal freezes in neutral. */}
      <div
        aria-label={`Pickup progress: ${listing.status}`}
        className="rounded-2xl border border-neutral-200/40 bg-card px-3 pb-3 pt-4 sm:px-5"
      >
        <div className="flex">
          {JOURNEY.map((step, i) => (
            <div
              key={step}
              className={cn(
                "min-h-[12px] flex-1 text-center font-mono text-[10.5px] font-bold tabular-nums",
                !terminal && i <= currentStep ? "text-neutral-900" : "text-neutral-700"
              )}
            >
              {i <= currentStep ? stepStamp(stepTimes[i]) : ""}
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
              STEP_FILL[Math.max(currentStep, 0)]
            )}
          />
          {JOURNEY.map((step, i) => {
            const done = !terminal && i <= currentStep;
            const active =
              !terminal && listing.status !== "delivered" && i === currentStep + 1;
            return (
              <div key={step} className="relative z-[1] flex flex-1 justify-center">
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
                        ? "border-rescued-600 bg-rescued-600"
                        : terminal && i <= currentStep
                          ? "border-neutral-400 bg-neutral-400"
                          : active
                            ? "border-rescued-400 bg-card"
                            : "border-neutral-200 bg-card"
                    )}
                  >
                    {i <= currentStep && <StepCheck />}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex">
          {JOURNEY.map((step, i) => (
            <div
              key={step}
              className={cn(
                "flex-1 text-center text-[13px] font-semibold leading-tight",
                !terminal && i <= currentStep
                  ? "text-neutral-700"
                  : !terminal && i === currentStep + 1
                    ? "text-neutral-700"
                    : "text-neutral-700"
              )}
            >
              {STEP_LABEL[step]}
            </div>
          ))}
        </div>
        {heldOvernight && (
          <p className="mt-2 text-center font-mono text-[13px] text-transit-800">
            Held overnight{deliverByLabel ? ` · deliver by ${deliverByLabel}` : ""}
          </p>
        )}
      </div>

        {/* Main */}
        <div className="overflow-hidden rounded-2xl border border-neutral-200/40 bg-card">
          {/* Food photo — the appetizing anchor the detail page was missing; the
              Meal Move mark as a calm placeholder when a listing has no photo. */}
          <div
            className={cn(
              "relative aspect-[16/9] w-full",
              listing.imageUrl ? "bg-neutral-100" : "bg-neutral-50"
            )}
          >
            {listing.imageUrl ? (
              <Image
                src={listing.imageUrl}
                alt={listing.title}
                fill
                sizes="(min-width: 1024px) 472px, 100vw"
                priority
                className={cn("object-cover", terminal && "opacity-75 saturate-[0.7]")}
              />
            ) : (
              <span
                aria-hidden
                className="absolute inset-x-0 inset-y-8 bg-neutral-300 [mask:url(/mealmovelogo.png)_center/contain_no-repeat] [-webkit-mask:url(/mealmovelogo.png)_center/contain_no-repeat]"
              />
            )}
          </div>
          <div className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-[26px] font-semibold leading-tight text-neutral-900 text-balance">
                  {listing.title}
                </h1>
                <MetaRow icon={<MapPin />} className="mt-1.5">
                  {listing.source}
                </MetaRow>
              </div>
              <StatusBadge status={listing.status} />
            </div>

            {/* Decision facts as two warm focal stats (no gray cells): how much
                food, and how long is left — serif numbers in semantic color. */}
            <div className="mt-5 flex items-stretch rounded-2xl border border-neutral-200/70">
              <div className="flex-1 px-5 py-3.5">
                <p className="font-display text-[30px] font-semibold leading-none text-rescued-600">
                  ~{listing.servings}
                </p>
                <p className="mt-2 font-mono text-[13px] text-neutral-700">
                  Servings
                </p>
              </div>
              <div className="w-px self-stretch bg-neutral-200/70" />
              <div className="flex-1 px-5 py-3.5">
                <p
                  className={cn(
                    "font-display text-[30px] font-semibold leading-none tabular-nums",
                    terminal
                      ? "text-neutral-700"
                      : listing.minutesLeft < 10
                        ? "text-failed-600"
                        : listing.minutesLeft < 35
                          ? "text-urgent-600"
                          : "text-rescued-600"
                  )}
                >
                  {terminal ? "—" : formatTimeLeft(listing.minutesLeft)}
                </p>
                <p className="mt-2 font-mono text-[13px] tabular-nums text-neutral-700">
                  {terminal ? "Closed" : "Left"} · {listing.expiresAt}
                </p>
              </div>
            </div>

            {/* Listing metadata as a calm labelled definition list (no pills):
                food type · handling · cars · drop-off · allergens. */}
            <InfoRows
              className="mt-5"
              labelClassName="w-24"
              rows={[
                ...(listing.category
                  ? [{ label: "food type", value: listing.category }]
                  : []),
                ...(listing.tempHandling
                  ? [
                      {
                        label: "handling",
                        value: (
                          <span className="inline-flex items-center gap-1.5">
                            {listing.tempHandling === "hot" ? (
                              <Flame className="text-[0.95em] text-neutral-700" />
                            ) : listing.tempHandling === "cold" ? (
                              <Snowflake className="text-[0.95em] text-neutral-700" />
                            ) : (
                              <Box className="text-[0.95em] text-neutral-700" />
                            )}
                            Keep {TEMP_LABEL[listing.tempHandling]}
                          </span>
                        ),
                      },
                    ]
                  : []),
                ...((listing.carsNeeded ?? 1) > 1
                  ? [
                      {
                        label: "cars",
                        value:
                          listing.status === "open"
                            ? `${(listing.carsNeeded ?? 1) - (listing.claimedCount ?? 0)} of ${listing.carsNeeded} still needed`
                            : `${listing.carsNeeded} cars`,
                      },
                    ]
                  : []),
                {
                  label: "drop-off",
                  value: (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {listing.dropOff ?? (
                        <span className="font-normal text-neutral-700">
                          chosen when you claim
                        </span>
                      )}
                      {listing.dropOffHours && (
                        <>
                          <OpenNowBadge hours={listing.dropOffHours} />
                          <span className="font-mono text-[13px] font-normal text-neutral-700">
                            today {formatDay(listing.dropOffHours[currentDayKey()])}
                          </span>
                        </>
                      )}
                    </span>
                  ),
                },
                ...(listing.allergens?.length
                  ? [
                      {
                        label: "allergens",
                        value: (
                          <span className="text-urgent-800">
                            <span aria-hidden>⚠ </span>
                            {listing.allergens.join(", ")}
                          </span>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            {listing.allergens?.length ? (
              <p className="mt-1.5 text-[14px] text-neutral-700">
                Contains allergens — handle and label with care.
              </p>
            ) : null}

            {/* Drop-off closed right now and this rescue is in flight — the one
                honey warning the handoff calls for; take-home is the fallback. */}
            {listing.mine &&
              ["claimed", "in transit"].includes(listing.status) &&
              dropOffOpen === false && (
                <div className="mt-3 flex gap-2.5 rounded-xl bg-urgent-50 px-4 py-3">
                  <span aria-hidden className="mt-px text-urgent-800">
                    ⚠
                  </span>
                  <p className="text-[15px] leading-relaxed text-urgent-800">
                    {listing.dropOff ?? "The drop-off"} is closed right now.
                    Message them to confirm, or keep it safe at home if no one
                    answers.
                  </p>
                </div>
              )}

            {listing.claimedBy && listing.status !== "open" && (
              <div className="mt-3">
                <MetaRow icon={<Users />}>
                  claimed by {listing.claimedBy}
                  {listing.buddyName && ` + ${listing.buddyName}`}
                </MetaRow>
              </div>
            )}


            {dropOffNotices.length > 0 && (
              <DropOffNotices notices={dropOffNotices} className="mt-4" />
            )}

            {listing.notes && (
              <div className="mt-5 border-t border-neutral-200/60 pt-4">
                <span className="font-mono text-[13px] text-neutral-700">
                  Special requests
                </span>
                <p className="mt-1.5 whitespace-pre-line text-[16px] leading-relaxed text-neutral-700">
                  {listing.notes}
                </p>
              </div>
            )}

            {terminal && (
              <div
                className={cn(
                  "mt-5 rounded-md px-4 py-3 text-[16px]",
                  listing.status === "expired"
                    ? "bg-neutral-50 text-neutral-800"
                    : "bg-failed-50 text-failed-800"
                )}
              >
                {listing.status === "expired"
                  ? "This window closed before anyone could pick it up."
                  : "This pickup wasn't completed. The drop-off was reassigned."}
              </div>
            )}

            {(listing.photoAtPickupUrl || listing.photoAtDeliveryUrl) && (
              <div className="mt-5">
                <p className="mb-2 font-mono text-[13px] text-neutral-700">
                  Proof photos
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {listing.photoAtPickupUrl && (
                    <ProofPhoto label="At pickup" url={listing.photoAtPickupUrl} />
                  )}
                  {listing.photoAtDeliveryUrl && (
                    <ProofPhoto
                      label="At delivery"
                      url={listing.photoAtDeliveryUrl}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Side: actions */}
        <aside className="space-y-6">
          {!terminal && (
            <div className="rounded-2xl border border-neutral-200/40 bg-card p-5">
              <p className="mb-3 font-mono text-[13px] text-neutral-700">
                Next step
              </p>
              {listing.status === "open" &&
                (canClaim && activeElsewhere ? (
                  <div className="rounded-xl bg-neutral-100 px-4 py-3 text-[16px] text-neutral-700">
                    <p>
                      One rescue at a time — you&apos;re already on{" "}
                      <span className="font-medium text-neutral-900">
                        {activeElsewhere.title}
                      </span>
                      . Deliver or release it before claiming another.
                    </p>
                    <Link
                      href={`/listings/${activeElsewhere.listingId}`}
                      className="mt-2 inline-flex items-center gap-1 text-[15px] font-semibold text-clay-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
                    >
                      Go to your current pickup
                      <ArrowRight className="text-[1.05em]" />
                    </Link>
                  </div>
                ) : canClaim ? (
                  <>
                    {needsDropOff && (
                      <div id="dropoff-picker" className="mb-4">
                        <p className="mb-2.5 text-[15px] text-neutral-700">
                          First, pick where you&apos;ll take it — every rescue
                          starts with a destination.
                        </p>
                        {dropOffChoices.length === 0 ? (
                          <p className="rounded-xl bg-neutral-100 px-4 py-3 text-[16px] text-neutral-700">
                            No drop-off can take this food right now — check
                            back soon.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {dropOffChoices.map((d, i) => {
                              const sel = chosenDropOff === d.id;
                              return (
                                <button
                                  key={d.id}
                                  type="button"
                                  aria-pressed={sel}
                                  onClick={() => {
                                    setChosenDropOff(d.id);
                                    trackClient("drop_off_selected", {
                                      listingId: listing.id,
                                      dropOffId: d.id,
                                      wasNearest: i === 0,
                                    });
                                  }}
                                  disabled={isPending}
                                  className={cn(
                                    "w-full rounded-xl border-2 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400",
                                    sel
                                      ? "border-rescued-400 bg-rescued-50"
                                      : "border-neutral-200 bg-card hover:border-neutral-400/60"
                                  )}
                                >
                                  <span className="flex items-center justify-between gap-3">
                                    <span className="text-[16px] font-medium text-neutral-900">
                                      {d.name}
                                    </span>
                                    <span
                                      aria-hidden
                                      className={cn(
                                        "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[13px]",
                                        sel
                                          ? "border-rescued-600 bg-rescued-600 text-white"
                                          : "border-neutral-200 bg-card text-transparent"
                                      )}
                                    >
                                      ✓
                                    </span>
                                  </span>
                                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[13px] text-neutral-700">
                                    <span className="tabular-nums">
                                      {d.miles.toFixed(1)} mi from pickup
                                    </span>
                                    {i === 0 && (
                                      <span className="rounded-full bg-rescued-100 px-2 py-0.5 text-[13px] text-rescued-800">
                                        Nearest
                                      </span>
                                    )}
                                    {d.retrievalHours && (
                                      <>
                                        <OpenNowBadge hours={d.retrievalHours} />
                                        <span>
                                          today{" "}
                                          {formatDay(d.retrievalHours[currentDayKey()])}
                                        </span>
                                      </>
                                    )}
                                    {d.needLevel !== "steady" && (
                                      <span>
                                        {d.needLevel === "high" ? "high need" : "low need"}
                                      </span>
                                    )}
                                  </span>
                                  {d.notes && (
                                    <span className="mt-1 block text-[14px] text-neutral-700">
                                      {d.notes}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    {!needsDropOff && listing.dropOff && (
                      <p className="mb-3 text-[15px] text-neutral-700">
                        Delivering to{" "}
                        <span className="font-medium text-neutral-900">
                          {listing.dropOff}
                        </span>{" "}
                        — the destination is already set for this rescue.
                      </p>
                    )}
                    <Button
                      variant="claim"
                      className="w-full"
                      onClick={onClaim}
                      disabled={isPending || !claimReady}
                    >
                      Claim pickup
                    </Button>
                    {needsDropOff && !chosenDropOff && dropOffChoices.length > 0 && (
                      <p className="mt-2 text-center font-mono text-[13px] text-neutral-700">
                        Choose a drop-off above to claim
                      </p>
                    )}
                  </>
                ) : (
                  <p className="rounded-xl bg-neutral-100 px-4 py-3 text-[16px] text-neutral-700">
                    Org admins oversee rescues — claiming is for volunteers.
                  </p>
                ))}
              {listing.status === "claimed" &&
                (listing.mine ? (
                  <>
                    <OpenInMapsButton
                      pickup={mapsPickup}
                      dropOff={mapsDropOff}
                      className="mb-4"
                    />
                    <SafetyChecklist answers={safety} onChange={setSafety} />
                    <ImageUploadField
                      label="Pickup photo"
                      optional={false}
                      hint="Snap the food as you leave — required to start delivery."
                      aspect="aspect-[4/3]"
                      uploadKey={`pickup:${id}`}
                      onChange={onPickupPhoto}
                    />
                  </>
                ) : (
                  <p className="text-[16px] text-neutral-700">
                    Waiting for {listing.claimedBy ?? "the volunteer"} to pick up
                    and start delivery.
                  </p>
                ))}
              {listing.status === "in transit" &&
                (listing.mine ? (
                  <>
                    <div className="mb-4 flex gap-2.5 rounded-xl bg-rescued-50 px-4 py-3">
                      <span aria-hidden className="mt-px text-rescued-800">
                        <Car />
                      </span>
                      <div>
                        <p className="text-[16px] font-semibold text-rescued-800">
                          You&apos;re on the way
                        </p>
                        <p className="mt-0.5 text-[15px] leading-relaxed text-neutral-700">
                          Head to {listing.dropOff ?? "the drop-off"} — follow
                          the route on the map.
                          {dropOffOpen === false &&
                            " It's closed right now, so message ahead before you arrive."}
                        </p>
                      </div>
                    </div>
                    <OpenInMapsButton
                      pickup={mapsPickup}
                      dropOff={mapsDropOff}
                      className="mb-4"
                    />
                    <ImageUploadField
                      label="Delivery photo"
                      optional={false}
                      hint="Snap the food at the drop-off — required to mark delivered."
                      aspect="aspect-[4/3]"
                      uploadKey={`delivery:${id}`}
                      onChange={onDeliveryPhoto}
                    />
                    {confirmTakeHome ? (
                      <div className="mt-3 animate-fade-in rounded-md bg-transit-50 px-4 py-3">
                        <p className="text-[16px] font-medium text-transit-800">
                          Take it home for tonight?
                        </p>
                        <p className="mt-0.5 text-[15px] text-transit-800/80">
                          Keep it chilled and deliver it tomorrow — the rescue
                          still counts, and {listing.dropOff ?? "the drop-off"}{" "}
                          will know it&apos;s coming.
                        </p>
                        <div className="mt-3 flex gap-2">
                          <Button
                            variant="secondary"
                            className="flex-1"
                            onClick={onTakeHome}
                            disabled={isPending}
                          >
                            Take it home
                          </Button>
                          <Button
                            variant="ghost"
                            className="flex-1"
                            onClick={() => setConfirmTakeHome(false)}
                            disabled={isPending}
                          >
                            Not yet
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => setConfirmTakeHome(true)}
                          disabled={isPending}
                          className={cn(
                            "flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-[16px] font-bold transition-all duration-200",
                            "bg-card text-urgent-800 shadow-[inset_0_0_0_2px_rgb(var(--urgent-200))] hover:-translate-y-0.5 hover:bg-urgent-50",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50 disabled:hover:translate-y-0"
                          )}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M3 9.5 12 3l9 6.5" />
                            <path d="M5 10v10h14V10" />
                            <path d="M9 20v-6h6v6" />
                          </svg>
                          Take it home instead
                        </button>
                        <p className="mt-1.5 text-center text-[14px] text-neutral-700">
                          Drop-off closed? Keep it safe until they reopen.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[16px] text-neutral-700">
                    {listing.claimedBy ?? "The volunteer"} is on the way to{" "}
                    {listing.dropOff ?? "the drop-off"}.
                  </p>
                ))}
              {listing.status === "taken home" &&
                (listing.mine ? (
                  <>
                    <div className="mb-4 rounded-md bg-transit-50 px-4 py-3">
                      <p className="text-[16px] font-medium text-transit-800">
                        You&apos;re holding this until tomorrow. 🌙
                      </p>
                      <p className="mt-0.5 text-[15px] text-transit-800/80">
                        Keep it chilled.{" "}
                        {deliverByLabel
                          ? `Aim to drop it at ${listing.dropOff ?? "the drop-off"} by ${deliverByLabel}.`
                          : `Drop it at ${listing.dropOff ?? "the drop-off"} tomorrow.`}
                      </p>
                    </div>
                    <ImageUploadField
                      label="Delivery photo"
                      optional={false}
                      hint="When you drop it off tomorrow, snap the food — required to mark delivered."
                      aspect="aspect-[4/3]"
                      uploadKey={`delivery:${id}`}
                      onChange={onDeliveryPhoto}
                    />
                  </>
                ) : (
                  <p className="text-[16px] text-neutral-700">
                    {listing.claimedBy ?? "The volunteer"} is holding this
                    overnight and will deliver it to{" "}
                    {listing.dropOff ?? "the drop-off"}{" "}
                    {deliverByLabel ? `by ${deliverByLabel}` : "tomorrow"}.
                  </p>
                ))}
              {listing.status === "delivered" && (
                <div className="rounded-xl bg-rescued-50 px-4 py-5 text-center">
                  <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-rescued-600 text-white">
                    <svg
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <p className="mt-3 font-display text-lg font-medium text-neutral-900">
                    Delivered — thank you
                  </p>
                  <p className="mt-1 text-[15px] text-neutral-700">
                    ~{listing.servings} servings reached{" "}
                    {listing.dropOff ?? "the drop-off"}.
                  </p>
                </div>
              )}
            </div>
          )}

          {listing.status === "delivered" && listing.mine && (
            <RescueAccuracySignal
              current={listing.rescueAccuracy}
              pending={isPending}
              onSubmit={onRescueAccuracy}
            />
          )}

          {onClaimActive &&
            (listing.buddyName || pickerOpen || outgoingInvite) && (
            <div className="rounded-2xl border border-neutral-200/40 bg-card p-5">
              {listing.buddyName ? (
                <>
                  <p className="mb-3 font-mono text-[13px] text-neutral-700">
                    Buddies
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="flex -space-x-2">
                      <Avatar name={listing.primaryName} className="border-2 border-white" />
                      <Avatar name={listing.buddyName} className="border-2 border-white" />
                    </span>
                    <span className="text-[16px] text-neutral-700">
                      {listing.mine
                        ? `You + ${listing.iAmBuddy ? listing.primaryName : listing.buddyName}`
                        : `${listing.primaryName} + ${listing.buddyName}`}
                      <span className="block font-mono text-[13px] text-rescued-600">
                        On this pickup together
                      </span>
                    </span>
                  </div>
                </>
              ) : pickerOpen ? (
                <BuddyInvitePicker
                  listingId={id}
                  onInvited={(name) => {
                    setPickerOpen(false);
                    show(`Invite sent to ${name}.`);
                  }}
                  onCancel={() => setPickerOpen(false)}
                />
              ) : outgoingInvite ? (
                <>
                  <p className="mb-3 font-mono text-[13px] text-neutral-700">
                    Buddy
                  </p>
                  <div className="rounded-md bg-urgent-50 px-4 py-3">
                    <p className="text-[16px] font-medium text-urgent-800">
                      Invite sent to {outgoingInvite.inviteeName}
                    </p>
                    <p className="mt-0.5 text-[15px] text-urgent-800/80">
                      Waiting for them to accept.
                    </p>
                    <button
                      type="button"
                      onClick={onCancelInvite}
                      disabled={isPending}
                      className="mt-2 text-[15px] font-medium text-urgent-800 underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 disabled:opacity-50"
                    >
                      Cancel invite
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {canChat && viewerId && listing.claimedAt != null && (
            <ChatPanel listingId={listing.id} viewerId={viewerId} />
          )}

          {/* Footer secondary — the two quiet escape hatches as a half-width
              pair under everything (pickup-detail handoff): invite a buddy,
              and cancel while the claim can still be released (pre-photo). */}
          {listing.mine &&
            onClaimActive &&
            (canInviteBuddy || canCancel || confirmCancel) && (
            <div className="border-t border-neutral-200/50 pt-4">
              {confirmCancel ? (
                <div className="animate-fade-in rounded-md bg-failed-50 px-4 py-3">
                  <p className="text-[16px] font-medium text-failed-800">
                    Cancel this pickup?
                  </p>
                  <p className="mt-0.5 text-[15px] text-failed-800/80">
                    {listing.iAmBuddy
                      ? "You'll step off — your buddy keeps the pickup."
                      : listing.buddyName
                        ? `${listing.buddyName} will take over so the rescue still happens.`
                        : "It goes back on the feed so someone else can grab it."}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="danger"
                      className="flex-1"
                      onClick={onCancelPickup}
                      disabled={isPending}
                    >
                      Cancel pickup
                    </Button>
                    <Button
                      variant="ghost"
                      className="flex-1"
                      onClick={() => setConfirmCancel(false)}
                      disabled={isPending}
                    >
                      Keep it
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2.5">
                  {canInviteBuddy && (
                    <Button
                      variant="secondary"
                      className="flex flex-1 items-center justify-center gap-2 px-4 py-2 text-[15px]"
                      onClick={() => setPickerOpen(true)}
                      disabled={isPending}
                    >
                      <Users />
                      Invite a buddy
                    </Button>
                  )}
                  {canCancel && (
                    <Button
                      variant="danger"
                      className="flex-1 px-4 py-2 text-[15px]"
                      onClick={() => setConfirmCancel(true)}
                      disabled={isPending}
                    >
                      Cancel pickup
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </aside>
        </div>

        {/* Side map — lg+ only, sticky like the feed's. While picking, the
            drop-off choices show as clay flag pins (tap one to select it); once
            the destination is set, only it rides beside the pickup pin. */}
        <div className="hidden lg:block">
          <div className="sticky top-20 h-[calc(100vh-7rem)]">
            <div className="relative h-full">
              <ListingsMap
                listings={mapListings}
                dropOffs={mapDropOffs}
                selectedDropOffId={needsDropOff ? chosenDropOff : listing.dropOffId ?? null}
                onSelectDropOff={needsDropOff ? setChosenDropOff : undefined}
                route={liveRoute}
                className="h-full"
              />
              {/* Route overlay — once the destination is set, the journey as a
                  glassy card over the map: pickup → drop-off with the
                  straight-line miles (pickup-detail handoff). */}
              {!terminal && listing.dropOff && chosenDropOffPin && (
                <div className="pointer-events-none absolute left-4 top-4 z-[1] max-w-[280px] rounded-2xl border border-neutral-200/60 bg-card/95 px-4 py-3.5 shadow-card backdrop-blur-sm">
                  <p className="font-mono text-[13px] text-neutral-700">
                    Your route{routeMiles != null && ` · ${routeMiles.toFixed(1)} mi`}
                  </p>
                  <div className="mt-2.5 flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="h-[9px] w-[9px] shrink-0 rounded-full bg-rescued-600 ring-[3px] ring-rescued-100"
                    />
                    <span className="truncate text-[15px] font-semibold text-neutral-800">
                      {listing.source}
                    </span>
                  </div>
                  <span
                    aria-hidden
                    className="ml-1 block h-3.5 w-px border-l border-dashed border-neutral-300"
                  />
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="h-[9px] w-[9px] shrink-0 rounded-full bg-neutral-900"
                    />
                    <span className="truncate text-[15px] font-semibold text-neutral-800">
                      {listing.dropOff}
                    </span>
                    {dropOffOpen === false && (
                      <span className="shrink-0 rounded-full bg-urgent-50 px-2 py-0.5 font-mono text-[14px] text-urgent-800">
                        Closed
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {celebration && (
        <RescueCelebration
          impact={celebration}
          servings={listing.servings}
          source={listing.source}
          dropOff={listing.dropOff}
          onClose={() => setCelebration(null)}
        />
      )}

      {showClaimBar && (
        <div className="fixed inset-x-0 bottom-[calc(3.875rem+env(safe-area-inset-bottom))] z-sticky border-t border-neutral-200/50 bg-neutral-50/90 px-4 py-3 backdrop-blur-md md:hidden">
          <Button
            variant="claim"
            className="w-full"
            onClick={() => {
              // Destination first: until a drop-off is picked, the pinned CTA
              // walks the volunteer to the picker instead of dead-ending on a
              // disabled button.
              if (!claimReady) {
                document
                  .getElementById("dropoff-picker")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
                return;
              }
              onClaim();
            }}
            disabled={isPending}
          >
            {claimReady ? "Claim pickup" : "Choose a drop-off"}
          </Button>
        </div>
      )}

      <Toast message={message} />
    </div>
  );
}
