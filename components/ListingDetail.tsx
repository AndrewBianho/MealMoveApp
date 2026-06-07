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
  cancelBuddyInvite,
  respondToBuddyInvite,
} from "@/app/actions";
import { CheckInPrompt } from "./CheckInPrompt";
import { ChatPanel } from "./ChatPanel";
import { Avatar } from "./Avatar";
import { BuddyInvitePicker } from "./BuddyInvitePicker";
import { ImageUploadField } from "./ImageUploadField";
import { OpenNowBadge } from "./RetrievalHoursDisplay";
import { currentDayKey, formatDay } from "@/lib/hours";
import type { Listing, ListingStatus } from "@/lib/types";

// The happy-path journey. expired / failed are terminal off-ramps and render
// their own banner rather than a step.
const JOURNEY: ListingStatus[] = ["open", "claimed", "in transit", "delivered"];

const STEP_LABEL: Record<string, string> = {
  open: "Posted",
  claimed: "Claimed",
  "in transit": "In transit",
  delivered: "Delivered",
};

function ProofPhoto({ label, url }: { label: string; url: string }) {
  return (
    <figure>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl">
        <Image src={url} alt={`Food ${label}`} fill sizes="200px" className="object-cover" />
      </div>
      <figcaption className="mt-1 font-mono text-[10px] uppercase tracking-wide text-neutral-400">
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
    <p className="flex items-center gap-2 font-sans text-[13px] text-neutral-600">
      <span className="text-neutral-400">{icon}</span>
      {children}
    </p>
  );
}

export function ListingDetail({
  listing,
  viewerId,
  canChat = false,
  incomingInvite = null,
  outgoingInvite = null,
}: {
  listing: Listing | null;
  viewerId?: string;
  canChat?: boolean;
  /** A pending buddy invite addressed to the current viewer, if any. */
  incomingInvite?: { id: string; inviterName: string } | null;
  /** The primary's outstanding buddy invite, if one is awaiting a response. */
  outgoingInvite?: { inviteeName: string } | null;
}) {
  const { message, show } = useToast();
  const [isPending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!listing) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-6 py-16 text-center">
        <p className="text-sm text-neutral-600">This listing isn&apos;t available.</p>
        <p className="mt-1 font-mono text-xs text-neutral-400">
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
  const currentStep = JOURNEY.indexOf(listing.status);
  const id = listing.id;

  function onClaim() {
    startTransition(async () => {
      await claimListing(id);
      show("Claimed — it's yours for the next fifteen minutes.");
    });
  }
  function onPickupPhoto(url: string | null) {
    if (!url) return;
    startTransition(async () => {
      await startDelivery(id, url);
      show("On your way — drive safe.");
    });
  }
  function onDeliveryPhoto(url: string | null) {
    if (!url) return;
    startTransition(async () => {
      await markDelivered(id, url);
      show("Delivered. Thank you for the rescue. 🌱");
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

  // Buddy UI only matters while the pickup is being worked.
  const onClaimActive =
    listing.status === "claimed" || listing.status === "in transit";
  const isPrimary = Boolean(listing.mine) && !listing.iAmBuddy;

  return (
    <div className={cn(isPending && "opacity-70 transition-opacity")}>
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-neutral-600 hover:text-neutral-900"
      >
        ← Feed
      </Link>

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
        <div className="overflow-hidden rounded-xl border border-neutral-200/40 bg-white">
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
              <div>
                <h1 className="text-[22px] font-medium leading-tight">
                  {listing.title}
                </h1>
              </div>
              <StatusBadge status={listing.status} />
            </div>

            <div className="space-y-2.5">
              <MetaRow icon={<MapPin />}>{listing.source}</MetaRow>
              <MetaRow icon={<Clock />}>
                {terminal
                  ? `closed ${listing.expiresAt}`
                  : `expires ${listing.expiresAt} · ${listing.minutesLeft} min left`}
              </MetaRow>
              <MetaRow icon={<Users />}>~{listing.servings} servings</MetaRow>
              {listing.dropOff && (
                <MetaRow icon={<MapPin />}>
                  → drop at {listing.dropOff}
                  {listing.dropOffHours && (
                    <span className="ml-2 inline-flex items-center gap-2 align-middle">
                      <OpenNowBadge hours={listing.dropOffHours} />
                      <span className="font-mono text-xs text-neutral-500">
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

            {listing.notes && (
              <div className="mt-5 rounded-md bg-urgent-50 px-4 py-3 text-sm text-urgent-800">
                <span className="font-mono text-[10px] uppercase tracking-wide">
                  special requests
                </span>
                <p className="mt-0.5">{listing.notes}</p>
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
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
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
          <div className="rounded-xl border border-neutral-200/40 bg-white p-5">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
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
                            : "border-neutral-200 bg-white text-neutral-400"
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
                        done ? "text-neutral-900" : "text-neutral-400"
                      )}
                    >
                      {STEP_LABEL[step]}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          {!terminal && (
            <div className="rounded-xl border border-neutral-200/40 bg-white p-5">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
                Next step
              </p>
              {listing.status === "open" && (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={onClaim}
                  disabled={isPending}
                >
                  Claim pickup
                </Button>
              )}
              {listing.status === "claimed" &&
                (listing.mine ? (
                  <ImageUploadField
                    label="Pickup photo"
                    optional={false}
                    hint="Snap the food as you leave — required to start delivery."
                    aspect="aspect-[4/3]"
                    onChange={onPickupPhoto}
                  />
                ) : (
                  <p className="text-sm text-neutral-600">
                    Waiting for {listing.claimedBy ?? "the volunteer"} to pick up
                    and start delivery.
                  </p>
                ))}
              {listing.status === "in transit" &&
                (listing.mine ? (
                  <ImageUploadField
                    label="Delivery photo"
                    optional={false}
                    hint="Snap the food at the drop-off — required to mark delivered."
                    aspect="aspect-[4/3]"
                    onChange={onDeliveryPhoto}
                  />
                ) : (
                  <p className="text-sm text-neutral-600">
                    {listing.claimedBy ?? "The volunteer"} is on the way to{" "}
                    {listing.dropOff ?? "the drop-off"}.
                  </p>
                ))}
              {listing.status === "delivered" && (
                <p className="text-sm text-neutral-600">
                  Complete — nothing more to do. 🌱
                </p>
              )}
            </div>
          )}

          {onClaimActive && (listing.buddyName || isPrimary) && (
            <div className="rounded-xl border border-neutral-200/40 bg-white p-5">
              {listing.buddyName ? (
                <>
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
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
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
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
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
                    Buddy
                  </p>
                  <p className="mb-3 flex items-start gap-2 text-[13px] text-neutral-600">
                    <span className="mt-0.5 text-neutral-400">
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

      <Toast message={message} />
    </div>
  );
}
