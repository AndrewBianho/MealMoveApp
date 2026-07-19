import { prisma } from "./prisma";
import { isOnClaim } from "./buddies";
import {
  aggregateStatus,
  pickupStage,
  LIVE_LISTING_STATUSES,
  type ClaimPickup,
} from "./claims";
import { sendDropOffPickupNotice, sendRestaurantRescueNotice } from "./notify";
import { cleanSafetyAnswers, type SafetyAnswers } from "./safety";
import {
  cleanAccuracyNote,
  cleanRescueAccuracy,
  type RescueAccuracy,
} from "./accuracy";
import { Prisma } from "@prisma/client";

// A structural slice of the Prisma client — just the methods these functions
// touch. Lets tests inject a fake db without standing up a database.
type Db = Pick<
  typeof prisma,
  "pickup" | "foodListing" | "listingEvent" | "message" | "$transaction"
>;

/**
 * Guard: load this user's claim on the listing — either as the primary
 * volunteer or the buddy (so either can capture the proof photo) — in one of
 * the expected stages, or throw. Stages are read off the volunteer's own
 * pickup, not the listing: on a multi-car listing each car advances at its own
 * pace while the listing status trails the slowest car (see lib/claims).
 */
async function loadClaimInStage(
  db: Db,
  userId: string,
  listingId: string,
  stages: readonly ("claimed" | "in_transit" | "taken_home")[]
) {
  const pickup = await db.pickup.findFirst({
    where: { listingId, OR: [{ volunteerId: userId }, { buddyId: userId }] },
    include: { listing: { include: { dropOff: true, pickups: true } } },
  });
  if (
    !pickup ||
    !isOnClaim(pickup, userId) ||
    !LIVE_LISTING_STATUSES.includes(pickup.listing.status) ||
    !(stages as readonly string[]).includes(pickupStage(pickup))
  ) {
    throw new Error("This pickup is no longer active.");
  }
  return pickup;
}

// The listing status once this pickup's fields change: re-aggregate all the
// listing's pickups with the acting one patched to its new state.
function nextListingStatus(
  pickup: { id: string; listing: { carsNeeded: number | null; pickups: ({ id: string } & ClaimPickup)[] } },
  patch: Partial<ClaimPickup>
) {
  const pickups = pickup.listing.pickups.map((p) =>
    p.id === pickup.id ? { ...p, ...patch } : p
  );
  return aggregateStatus(pickups, pickup.listing.carsNeeded);
}

// "Deliver by tomorrow evening." A taken-home pickup gets a calm next-day
// deadline (the following day at 8 PM local) — used for display and a possible
// gentle nudge, never to auto-fail the pickup.
function nextEveningDeadline(now: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return d;
}

/**
 * Capture the pickup photo and advance the claim → in_transit. The photo is
 * required — without it the claim cannot move, which is the proof the chapter
 * keeps that a pickup actually happened.
 */
export async function startDeliveryWithPhotoFor(
  db: Db,
  userId: string,
  listingId: string,
  photoUrl: string,
  safety?: SafetyAnswers | null,
  notify = sendDropOffPickupNotice
): Promise<void> {
  const url = photoUrl?.trim();
  if (!url) throw new Error("A pickup photo is required to start delivery.");
  const pickup = await loadClaimInStage(db, userId, listingId, ["claimed"]);
  const dropOff = pickup.listing.dropOff;
  // Record the dismissible safety checklist alongside the proof, if answered.
  const checklist = cleanSafetyAnswers(safety);

  // A durable "it's picked up" line in the coordination thread, posted from the
  // volunteer who captured the photo (a participant). The drop-off, restaurant,
  // and buddy all see it — the in-app counterpart to the push below.
  const body = dropOff
    ? `Picked up — on the way to ${dropOff.name} now.`
    : "Picked up — on the way now.";

  await db.$transaction([
    db.pickup.update({
      where: { id: pickup.id },
      data: {
        photoAtPickupUrl: url,
        ...(checklist
          ? { safetyChecklist: checklist as Prisma.InputJsonValue }
          : {}),
      },
    }),
    db.foodListing.update({
      where: { id: listingId },
      data: { status: nextListingStatus(pickup, { photoAtPickupUrl: url }) },
    }),
    db.listingEvent.create({
      data: {
        listingId,
        type: "photo_at_pickup",
        actorId: userId,
        meta: { photoUrl: url },
      },
    }),
    db.listingEvent.create({
      data: { listingId, type: "in_transit", actorId: userId },
    }),
    db.message.create({
      data: { listingId, senderId: userId, body },
    }),
  ]);

  // Once the pickup is confirmed, also push the destination a "food is inbound"
  // notice. Only when a drop-off is assigned — it's optional until set
  // downstream. Fired after the transaction commits so a failed transition
  // never notifies.
  if (dropOff) {
    await notify({
      listingId,
      dropOffId: dropOff.id,
      dropOffName: dropOff.name,
      listingTitle: pickup.listing.title,
    });
  }
}

/**
 * Capture the delivery photo and complete the claim → delivered. Also stamps
 * deliveredAt. The photo is required, same as at pickup. A multi-car listing
 * only reads "delivered" once every car has delivered.
 */
export async function markDeliveredWithPhotoFor(
  db: Db,
  userId: string,
  listingId: string,
  photoUrl: string,
  now: number = Date.now(),
  notifyRestaurant = sendRestaurantRescueNotice
): Promise<void> {
  const url = photoUrl?.trim();
  if (!url) throw new Error("A delivery photo is required to mark delivered.");
  // Completes the rescue whether the food went straight there (in_transit) or
  // was kept overnight and delivered the next day (taken_home).
  const pickup = await loadClaimInStage(db, userId, listingId, [
    "in_transit",
    "taken_home",
  ]);

  // Credit every seat that showed up: a delivered event per volunteer (and the
  // buddy, if any) so reliability — which tallies delivered events per actor —
  // counts both. Whoever physically captured the photo owns the photo event.
  const seats = pickup.buddyId
    ? [pickup.volunteerId, pickup.buddyId]
    : [pickup.volunteerId];

  const newStatus = nextListingStatus(pickup, { deliveredAt: new Date(now) });

  await db.$transaction([
    db.pickup.update({
      where: { id: pickup.id },
      data: { photoAtDeliveryUrl: url, deliveredAt: new Date(now) },
    }),
    db.foodListing.update({
      where: { id: listingId },
      data: { status: newStatus },
    }),
    db.listingEvent.create({
      data: {
        listingId,
        type: "photo_at_delivery",
        actorId: userId,
        meta: { photoUrl: url },
      },
    }),
    ...seats.map((id) =>
      db.listingEvent.create({
        data: { listingId, type: "delivered", actorId: id },
      })
    ),
  ]);

  // The restaurant learns their food made it — only once the listing is fully
  // delivered (a multi-car listing stays quiet until the last car lands).
  // Best-effort: the rescue is already complete, so a push failure must not throw.
  if (newStatus === "delivered") {
    try {
      await notifyRestaurant({
        event: "delivered",
        restaurantId: pickup.listing.restaurantId,
        listingId,
        listingTitle: pickup.listing.title,
      });
    } catch {
      // best-effort notification
    }
  }
}

/**
 * "Take it home for tomorrow." When a volunteer has the food (in_transit) but
 * can't complete the delivery today — the drop-off closed, they ran out of time
 * — they keep it overnight and deliver the next day instead of the rescue
 * failing. Advances their claim in_transit → taken_home, stamps a gentle
 * next-day deadline, and posts a line to the coordination thread so the
 * drop-off knows it's delayed, not lost. The volunteer completes it later with
 * the normal delivery photo (markDeliveredWithPhotoFor accepts taken_home).
 * Non-punitive: the sweep never touches in-flight pickups, so a taken-home
 * listing is never auto-failed.
 */
export async function takeHomeForTomorrowFor(
  db: Db,
  userId: string,
  listingId: string,
  now: number = Date.now()
): Promise<void> {
  const pickup = await loadClaimInStage(db, userId, listingId, ["in_transit"]);
  const dropOff = pickup.listing.dropOff;
  const deliverBy = nextEveningDeadline(now);

  const body = dropOff
    ? `Couldn't deliver today — keeping it safe overnight and dropping at ${dropOff.name} tomorrow.`
    : "Couldn't deliver today — keeping it safe overnight and delivering tomorrow.";

  await db.$transaction([
    db.pickup.update({
      where: { id: pickup.id },
      data: { takenHomeAt: new Date(now), deliverBy },
    }),
    db.foodListing.update({
      where: { id: listingId },
      data: {
        status: nextListingStatus(pickup, { takenHomeAt: new Date(now) }),
      },
    }),
    db.listingEvent.create({
      data: {
        listingId,
        type: "taken_home",
        actorId: userId,
        meta: { deliverBy: deliverBy.toISOString() },
      },
    }),
    db.message.create({
      data: { listingId, senderId: userId, body },
    }),
  ]);
}

/**
 * Record the volunteer's one-tap "rescue accuracy" signal after they've handled
 * the food — was it present and roughly as described? Symmetry to the volunteer
 * reliability meter, but kept private (org-admin + the restaurant only). Allowed
 * once the food's been picked up and delivered (or kept overnight); only the
 * primary or buddy on the claim can answer. Overwriteable so a fat-finger tap is
 * fixable; never blocks the rescue. Logs to the listing event stream.
 */
export async function recordRescueAccuracyFor(
  db: Db,
  userId: string,
  listingId: string,
  accuracy: unknown,
  note?: unknown
): Promise<void> {
  const value = cleanRescueAccuracy(accuracy);
  if (!value) throw new Error("Pick whether the food was as described.");
  const cleanNote = cleanAccuracyNote(note);

  const pickup = await db.pickup.findFirst({
    where: { listingId, OR: [{ volunteerId: userId }, { buddyId: userId }] },
    include: { listing: { include: { dropOff: true, pickups: true } } },
  });
  if (
    !pickup ||
    !isOnClaim(pickup, userId) ||
    !["in_transit", "taken_home", "delivered"].includes(pickupStage(pickup))
  ) {
    throw new Error("This pickup isn't ready for a rescue-accuracy signal.");
  }

  await db.$transaction([
    db.pickup.update({
      where: { id: pickup.id },
      data: { rescueAccuracy: value as RescueAccuracy, rescueAccuracyNote: cleanNote },
    }),
    db.listingEvent.create({
      data: {
        listingId,
        type: "rescue_accuracy",
        actorId: userId,
        meta: cleanNote ? { accuracy: value, note: cleanNote } : { accuracy: value },
      },
    }),
  ]);
}
