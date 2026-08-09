import type { Listing, ListingStatus } from "./types";

// The rescue lifecycle, as one shared vocabulary. Two surfaces render it — the
// feed's PickupTimelineCard and the listing detail page's RescueProgress — and
// the detail page words its photo prompts in terms of the step the photo
// advances into ("take the photo to move to Picked up"). Keeping the steps, the
// current position, and the next position in one module is what stops those
// three from drifting apart.

export const RESCUE_STEPS = [
  "Posted",
  "Claimed",
  "Picked up",
  "Delivered",
] as const;

export type RescueStep = (typeof RESCUE_STEPS)[number];

/** Index into RESCUE_STEPS: 0 posted · 1 claimed · 2 picked up · 3 delivered. */
export type RescueStepIndex = 0 | 1 | 2 | 3;

// The shape progress actually depends on — a structural slice of Listing, so
// tests can pass a plain object and callers can pass a full listing.
export type RescueProgressInput = {
  status: ListingStatus;
  claimedAt?: number;
  pickedUpAt?: number;
  deliveredAt?: number;
  photoAtPickupUrl?: string;
};

/**
 * The furthest lifecycle step this rescue has actually reached.
 *
 * "taken home" is a pause *within* in-transit rather than a stage of its own —
 * the food is picked up and still owed to the drop-off — so it reads as step 2,
 * the same as "in transit".
 */
export function progressOf(l: RescueProgressInput): RescueStepIndex {
  switch (l.status) {
    case "claimed":
      return 1;
    case "in transit":
    case "taken home":
      return 2;
    case "delivered":
      return 3;
    case "expired":
    case "failed":
      // Unhappy end — freeze at whatever was actually reached rather than
      // implying the rescue climbed further than it did.
      return l.deliveredAt
        ? 3
        : l.pickedUpAt || l.photoAtPickupUrl
          ? 2
          : l.claimedAt
            ? 1
            : 0;
    default:
      return 0;
  }
}

/** A rescue that ended without being delivered climbs no further. */
export function isTerminal(status: ListingStatus): boolean {
  return status === "expired" || status === "failed";
}

/**
 * The step this rescue advances into next, or null when there is no next step —
 * it's delivered, or it ended early. This is what the detail page names in its
 * photo prompt, so the volunteer knows what the shutter button is *for*.
 */
export function nextStepOf(
  l: RescueProgressInput
): { index: RescueStepIndex; name: RescueStep } | null {
  if (isTerminal(l.status) || l.status === "delivered") return null;
  const next = progressOf(l) + 1;
  if (next > 3) return null;
  const index = next as RescueStepIndex;
  return { index, name: RESCUE_STEPS[index] };
}

/**
 * "Step 3 of 4" — the position a volunteer is working *toward*, which is the
 * one the photo in front of them will complete. Null once there's nothing left
 * to advance into, so the caller can drop the line rather than print "step 5".
 */
export function stepCounterLabel(l: RescueProgressInput): string | null {
  const next = nextStepOf(l);
  if (!next) return null;
  return `Step ${next.index + 1} of ${RESCUE_STEPS.length}`;
}

/**
 * Does this listing belong to the viewer as a live rescue they're working? The
 * detail page shows the tracker (and the forward-looking photo prompt) exactly
 * when this is true — a restaurant reading its own listing gets neither.
 */
export function isLiveOwnRescue(l: Pick<Listing, "status" | "mine">): boolean {
  return (
    Boolean(l.mine) &&
    (l.status === "claimed" ||
      l.status === "in transit" ||
      l.status === "taken home")
  );
}
