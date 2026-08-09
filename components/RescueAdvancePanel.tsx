"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { cn } from "./cn";
import { ImageUploadField } from "./ImageUploadField";
import { SafetyChecklist } from "./SafetyChecklist";
import { RescueProgress } from "./RescueProgress";
import { CELEBRATION_MS, StageAdvanced } from "./StageAdvanced";
import { markDelivered, startDelivery } from "@/app/actions";
import {
  RESCUE_STEPS,
  nextStepOf,
  stepCounterLabel,
  type RescueStepIndex,
} from "@/lib/rescueProgress";
import type { SafetyAnswers } from "@/lib/safety";
import type { Listing, VolunteerImpact } from "@/lib/types";

// The rescue a volunteer is carrying, advanced in place on the feed: tracker,
// where-you-are counter, and the photo that moves it to the next stage —
// without a trip to the listing detail page. The detail page still owns
// everything else (releasing, buddies, chat, take-it-home, the full facts), and
// stays one tap away.
//
// Photo capture, the safety checklist and the offline upload queue are the same
// components the detail page uses, and `uploadKey` matches it exactly, so a
// photo taken here while offline resumes wherever the volunteer lands next.

export function RescueAdvancePanel({
  listing,
  onDelivered,
  className,
}: {
  listing: Listing;
  /** Hands the fresh lifetime impact up so an always-mounted parent can own the
   *  delivery celebration — this panel unmounts the moment the rescue leaves
   *  the feed's "current rescue" slot. */
  onDelivered?: (impact: VolunteerImpact) => void;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  // Dismissible food-safety checklist answers, captured with the pickup proof.
  const [safety, setSafety] = useState<SafetyAnswers>({});
  // The step a photo just carried this rescue into — drives the drawn check on
  // the tracker and the banner below it.
  const [advancedTo, setAdvancedTo] = useState<RescueStepIndex | null>(null);

  // A celebration is a moment, not a state (see CELEBRATION_MS).
  useEffect(() => {
    if (advancedTo == null) return;
    const t = setTimeout(() => setAdvancedTo(null), CELEBRATION_MS);
    return () => clearTimeout(t);
  }, [advancedTo]);

  const id = listing.id;
  const dest = listing.dropOff ?? "the drop-off";
  const nextStep = nextStepOf(listing);
  const stepCounter = stepCounterLabel(listing);
  const awaitingPickup = listing.status === "claimed";

  // Every prompt leads with the stage it unlocks, so the shutter button is
  // never just "a photo" — it's the thing that moves the rescue forward.
  const hint = (detail: string) =>
    nextStep ? `Take the photo to move to “${nextStep.name}” — ${detail}` : detail;

  function onPickupPhoto(url: string | null) {
    if (!url) return;
    // Read the step the photo completes *before* the action lands — once the
    // server revalidates, `listing` already reports the new stage.
    const reached = nextStepOf(listing)?.index ?? null;
    startTransition(async () => {
      await startDelivery(id, url, safety);
      setAdvancedTo(reached);
    });
  }

  function onDeliveryPhoto(url: string | null) {
    if (!url) return;
    startTransition(async () => {
      const impact = await markDelivered(id, url);
      onDelivered?.(impact);
    });
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <RescueProgress listing={listing} celebrateStep={advancedTo} />
        {stepCounter && (
          <p className="mt-2 text-center font-mono text-[13px] text-neutral-700">
            {/* One expression, not text-after-expression: JSX strips the
                leading space off a text node that follows `{...}`, which ate
                the gap and rendered "Step 4 of 4· you're here". */}
            {`${stepCounter} · you're here`}
          </p>
        )}
      </div>

      {advancedTo != null && (
        <StageAdvanced
          step={RESCUE_STEPS[advancedTo]}
          detail={`You're on the way to ${dest}.`}
          next="snap the delivery photo when you arrive."
        />
      )}

      {awaitingPickup ? (
        <>
          <SafetyChecklist answers={safety} onChange={setSafety} />
          <ImageUploadField
            label="Pickup photo"
            optional={false}
            hint={hint("snap the food as you leave.")}
            aspect="aspect-[4/3]"
            uploadKey={`pickup:${id}`}
            onChange={onPickupPhoto}
          />
        </>
      ) : (
        <ImageUploadField
          label="Delivery photo"
          optional={false}
          hint={hint(
            listing.status === "taken home"
              ? "snap the food when you drop it off tomorrow."
              : `snap the food at ${dest}.`
          )}
          aspect="aspect-[4/3]"
          uploadKey={`delivery:${id}`}
          onChange={onDeliveryPhoto}
        />
      )}

      <p className="text-center">
        <Link
          href={`/listings/${id}`}
          className={cn(
            "text-[15px] font-semibold text-clay-800 underline-offset-2 hover:underline",
            isPending && "pointer-events-none opacity-60"
          )}
        >
          More details
        </Link>
      </p>
    </div>
  );
}
