"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useTransition } from "react";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";
import { Toast, useToast } from "./Toast";
import { Clock, MapPin, Users } from "./icons";
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
import { CheckInPrompt } from "./CheckInPrompt";
import { NotificationPrimeCard } from "./NotificationPrimeCard";
import { ChatPanel } from "./ChatPanel";
import { Avatar } from "./Avatar";
import { BuddyInvitePicker } from "./BuddyInvitePicker";
import { ImageUploadField } from "./ImageUploadField";
import { SafetyChecklist } from "./SafetyChecklist";
import { RescueAccuracySignal } from "./RescueAccuracySignal";
import type { SafetyAnswers } from "@/lib/safety";
import type { RescueAccuracy } from "@/lib/accuracy";
import { OpenNowBadge } from "./RetrievalHoursDisplay";
import { DropOffNotices } from "./DropOffNotices";
import { RescueCelebration } from "./RescueCelebration";
import { currentDayKey, formatDay } from "@/lib/hours";
import { formatTimeLeft } from "@/lib/time";
import type { Listing, ListingStatus, VolunteerImpact, DropOffNoticeView } from "@/lib/types";

// The happy-path journey. expired / failed are terminal off-ramps and render
// their own banner rather than a step.
const JOURNEY: ListingStatus[] = ["open", "claimed", "in transit", "delivered"];

const STEP_LABEL: Record<string, string> = {
  open: "Posted",
  claimed: "Claimed",
  "in transit": "In transit",
  delivered: "Delivered",
};

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
      <figcaption className="mt-1 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
        {label}
      </figcaption>
    </figure>
  );
}

function MetaRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-center gap-2 font-sans text-[13px] text-neutral-700">
      <span className="text-neutral-600">{icon}</span>
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

  if (!listing) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 bg-card px-6 py-16 text-center">
        <p className="text-sm text-neutral-700">This listing isn&apos;t available.</p>
        <p className="mt-1 font-mono text-xs text-neutral-700">
          It may have been removed.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-rescued-600 hover:underline"
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

  function onClaim() {
    startTransition(async () => {
      await claimListing(id);
      if (canPrimeNotifications) setPrimeOpen(true);
      show("Claimed — it's yours for the next fifteen minutes.");
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

  return (
    <div className={cn(isPending && "opacity-70 transition-opacity")}>
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-neutral-700 hover:text-neutral-900"
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
          <p className="font-mono text-[10px] uppercase tracking-wide text-rescued-800">
            Buddy invite
          </p>
          <p className="mt-1 text-sm text-rescued-800">
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

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main */}
        <div className="overflow-hidden rounded-2xl border border-neutral-200/40 bg-card">
          <div
            className={cn(
              "h-[3px]",
              terminal
                ? "bg-neutral-200"
                : listing.minutesLeft < 10
                  ? "bg-failed-400"
                  : listing.minutesLeft < 35
                    ? "bg-urgent-400"
                    : "bg-rescued-400"
            )}
          />
          <div className="p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-[26px] font-semibold leading-tight text-neutral-900 text-balance">
                  {listing.title}
                </h1>
                {!terminal && (
                  <span
                    className={cn(
                      "mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums",
                      listing.minutesLeft < 10
                        ? "bg-failed-50 text-failed-800"
                        : listing.minutesLeft < 35
                          ? "bg-urgent-50 text-urgent-800"
                          : "bg-rescued-50 text-rescued-800"
                    )}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    {formatTimeLeft(listing.minutesLeft)} left
                  </span>
                )}
              </div>
              <StatusBadge status={listing.status} />
            </div>

            <div className="space-y-2.5">
              <MetaRow icon={<MapPin />}>{listing.source}</MetaRow>
              <MetaRow icon={<Clock />}>
                {terminal
                  ? `closed ${listing.expiresAt}`
                  : `expires ${listing.expiresAt} · ${formatTimeLeft(listing.minutesLeft)} left`}
              </MetaRow>
              <MetaRow icon={<Users />}>~{listing.servings} servings</MetaRow>
              {listing.dropOff && (
                <MetaRow icon={<MapPin />}>
                  → drop at {listing.dropOff}
                  {listing.dropOffHours && (
                    <span className="ml-2 inline-flex items-center gap-2 align-middle">
                      <OpenNowBadge hours={listing.dropOffHours} />
                      <span className="font-mono text-xs text-neutral-700">
                        today {formatDay(listing.dropOffHours[currentDayKey()])}
                      </span>
                    </span>
                  )}
                </MetaRow>
              )}
              {listing.claimedBy && listing.status !== "open" && (
                <MetaRow icon={<Users />}>
                  claimed by {listing.claimedBy}
                  {listing.buddyName && ` + ${listing.buddyName}`}
                </MetaRow>
              )}
            </div>

            {(listing.allergens?.length || listing.tempHandling) && (
              <div className="mt-4 rounded-md bg-neutral-100 px-4 py-3 text-sm text-neutral-800">
                <span className="font-mono text-[10px] uppercase tracking-wide text-neutral-600">
                  food safety
                </span>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {listing.tempHandling && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-transit-50 px-2.5 py-1 font-mono text-[11px] text-transit-800">
                      keep {TEMP_LABEL[listing.tempHandling]}
                    </span>
                  )}
                  {listing.allergens?.map((a) => (
                    <span
                      key={a}
                      className="inline-flex items-center gap-1.5 rounded-full bg-urgent-50 px-2.5 py-1 font-mono text-[11px] text-urgent-800"
                    >
                      <span aria-hidden>⚠</span>
                      {a}
                    </span>
                  ))}
                </div>
                {listing.allergens?.length ? (
                  <p className="mt-1.5 text-[12px] text-neutral-600">
                    Contains allergens — handle and label with care.
                  </p>
                ) : null}
              </div>
            )}

            {dropOffNotices.length > 0 && (
              <DropOffNotices notices={dropOffNotices} className="mt-4" />
            )}

            {listing.notes && (
              <div className="mt-5 rounded-md bg-neutral-100 px-4 py-3 text-sm text-neutral-800">
                <span className="font-mono text-[10px] uppercase tracking-wide text-neutral-600">
                  special requests
                </span>
                <p className="mt-0.5 whitespace-pre-line">{listing.notes}</p>
              </div>
            )}

            {terminal && (
              <div
                className={cn(
                  "mt-5 rounded-md px-4 py-3 text-sm",
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
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
                  Proof photos
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {listing.photoAtPickupUrl && (
                    <ProofPhoto label="at pickup" url={listing.photoAtPickupUrl} />
                  )}
                  {listing.photoAtDeliveryUrl && (
                    <ProofPhoto
                      label="at delivery"
                      url={listing.photoAtDeliveryUrl}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Side: timeline + actions */}
        <aside className="space-y-6">
          <div className="rounded-2xl border border-neutral-200/40 bg-card p-5">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
              Status
            </p>
            <ol className="space-y-0">
              {JOURNEY.map((step, i) => {
                const done = !terminal && i <= currentStep;
                const isLast = i === JOURNEY.length - 1;
                return (
                  <li key={step} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          "grid h-5 w-5 place-items-center rounded-full border text-[10px]",
                          done
                            ? "border-rescued-600 bg-rescued-600 text-white"
                            : "border-neutral-200 bg-card text-neutral-600"
                        )}
                      >
                        {done ? "✓" : i + 1}
                      </span>
                      {!isLast && (
                        <span
                          className={cn(
                            "my-1 w-px flex-1",
                            done ? "bg-rescued-200" : "bg-neutral-200"
                          )}
                        />
                      )}
                    </div>
                    <span
                      className={cn(
                        "pb-4 text-sm",
                        done ? "text-neutral-900" : "text-neutral-600"
                      )}
                    >
                      {STEP_LABEL[step]}
                      {heldOvernight && step === "in transit" && (
                        <span className="mt-0.5 block font-mono text-[11px] text-transit-800">
                          held overnight{deliverByLabel ? ` · deliver by ${deliverByLabel}` : ""}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          {!terminal && (
            <div className="rounded-2xl border border-neutral-200/40 bg-card p-5">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
                Next step
              </p>
              {listing.status === "open" &&
                (canClaim ? (
                  <Button
                    variant="claim"
                    className="w-full"
                    onClick={onClaim}
                    disabled={isPending}
                  >
                    Claim pickup
                  </Button>
                ) : (
                  <p className="rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
                    Org admins oversee rescues — claiming is for volunteers.
                  </p>
                ))}
              {listing.status === "claimed" &&
                (listing.mine ? (
                  <>
                    <SafetyChecklist answers={safety} onChange={setSafety} />
                    <ImageUploadField
                      label="Pickup photo"
                      optional={false}
                      hint="Snap the food as you leave — required to start delivery."
                      aspect="aspect-[4/3]"
                      uploadKey={`pickup:${id}`}
                      onChange={onPickupPhoto}
                    />
                    {confirmCancel ? (
                      <div className="mt-3 animate-fade-in rounded-md bg-failed-50 px-4 py-3">
                        <p className="text-sm font-medium text-failed-800">
                          Cancel this pickup?
                        </p>
                        <p className="mt-0.5 text-[13px] text-failed-800/80">
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
                      <div className="mt-4 border-t border-neutral-200/50 pt-4">
                        <p className="mb-2 text-[13px] text-neutral-700">
                          Can&apos;t make it after all?
                        </p>
                        <Button
                          variant="secondary"
                          className="flex w-full items-center justify-center gap-2"
                          onClick={() => setConfirmCancel(true)}
                          disabled={isPending}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.8}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path d="m15 9-6 6M9 9l6 6" />
                          </svg>
                          Cancel pickup
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-neutral-700">
                    Waiting for {listing.claimedBy ?? "the volunteer"} to pick up
                    and start delivery.
                  </p>
                ))}
              {listing.status === "in transit" &&
                (listing.mine ? (
                  <>
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
                        <p className="text-sm font-medium text-transit-800">
                          Take it home for tonight?
                        </p>
                        <p className="mt-0.5 text-[13px] text-transit-800/80">
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
                      <div className="mt-4 border-t border-neutral-200/50 pt-4">
                        <p className="mb-2 text-[13px] text-neutral-700">
                          Drop-off closed, or out of time today?
                        </p>
                        <Button
                          variant="secondary"
                          className="flex w-full items-center justify-center gap-2"
                          onClick={() => setConfirmTakeHome(true)}
                          disabled={isPending}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.8}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                          </svg>
                          Take it home for tomorrow
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-neutral-700">
                    {listing.claimedBy ?? "The volunteer"} is on the way to{" "}
                    {listing.dropOff ?? "the drop-off"}.
                  </p>
                ))}
              {listing.status === "taken home" &&
                (listing.mine ? (
                  <>
                    <div className="mb-4 rounded-md bg-transit-50 px-4 py-3">
                      <p className="text-sm font-medium text-transit-800">
                        You&apos;re holding this until tomorrow. 🌙
                      </p>
                      <p className="mt-0.5 text-[13px] text-transit-800/80">
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
                  <p className="text-sm text-neutral-700">
                    {listing.claimedBy ?? "The volunteer"} is holding this
                    overnight and will deliver it to{" "}
                    {listing.dropOff ?? "the drop-off"}{" "}
                    {deliverByLabel ? `by ${deliverByLabel}` : "tomorrow"}.
                  </p>
                ))}
              {listing.status === "delivered" && (
                <p className="text-sm text-neutral-700">
                  Complete — nothing more to do. 🌱
                </p>
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

          {onClaimActive && (listing.buddyName || isPrimary) && (
            <div className="rounded-2xl border border-neutral-200/40 bg-card p-5">
              {listing.buddyName ? (
                <>
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
                    Buddies
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="flex -space-x-2">
                      <Avatar name={listing.primaryName} className="border-2 border-white" />
                      <Avatar name={listing.buddyName} className="border-2 border-white" />
                    </span>
                    <span className="text-sm text-neutral-700">
                      {listing.mine
                        ? `You + ${listing.iAmBuddy ? listing.primaryName : listing.buddyName}`
                        : `${listing.primaryName} + ${listing.buddyName}`}
                      <span className="block font-mono text-[11px] text-rescued-600">
                        on this pickup together
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
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
                    Buddy
                  </p>
                  <div className="rounded-md bg-urgent-50 px-4 py-3">
                    <p className="text-sm font-medium text-urgent-800">
                      Invite sent to {outgoingInvite.inviteeName}
                    </p>
                    <p className="mt-0.5 text-[13px] text-urgent-800/80">
                      Waiting for them to accept.
                    </p>
                    <button
                      type="button"
                      onClick={onCancelInvite}
                      disabled={isPending}
                      className="mt-2 text-[13px] font-medium text-urgent-800 underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 disabled:opacity-50"
                    >
                      Cancel invite
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
                    Buddy
                  </p>
                  <p className="mb-3 flex items-start gap-2 text-[13px] text-neutral-700">
                    <span className="mt-0.5 text-neutral-600">
                      <Users />
                    </span>
                    Doing this with someone? Invite a buddy so you&apos;ve got
                    each other&apos;s backs.
                  </p>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setPickerOpen(true)}
                    disabled={isPending}
                  >
                    Invite a buddy
                  </Button>
                </>
              )}
            </div>
          )}

          {listing.status === "claimed" &&
            listing.mine &&
            listing.claimedAt != null &&
            listing.holdUntil != null && (
              <CheckInPrompt
                listingId={listing.id}
                claimedAt={listing.claimedAt}
                holdUntil={listing.holdUntil}
                lastCheckInAt={listing.lastCheckInAt}
              />
            )}

          {canChat && viewerId && listing.claimedAt != null && (
            <ChatPanel listingId={listing.id} viewerId={viewerId} />
          )}
        </aside>
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

      <Toast message={message} />
    </div>
  );
}
