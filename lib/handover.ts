import { loadClaimInStage, type Db } from "./photos";

/**
 * The two beats around the handover itself.
 *
 * Both are recorded as `ListingEvent` rows rather than columns on Pickup. That
 * is deliberate, and not only because it avoids a migration: neither changes
 * where the rescue *is*. A volunteer arriving hasn't delivered yet, and a
 * drop-off acknowledging receipt is a second, independent voice on a delivery
 * the volunteer already recorded. Keeping both out of `status` means a receipt
 * can never contradict the volunteer or silently re-open a closed rescue — it
 * only ever adds a line to the record.
 */

export const ARRIVED = "arrived";
export const RECEIVED = "received";

/**
 * The volunteer (or their buddy) says they're at the drop-off.
 *
 * This is the gap the flow had: between "on the way" and "delivered" there was
 * nothing, so a volunteer at a locked door or the wrong entrance had no way to
 * say so and nobody expecting them knew they were outside. Recorded once —
 * arriving twice is the same fact.
 */
export async function markArrivedFor(
  db: Db,
  userId: string,
  listingId: string
): Promise<{ alreadyArrived: boolean }> {
  const pickup = await loadClaimInStage(db, userId, listingId, [
    "in_transit",
    "taken_home",
  ]);

  const existing = await db.listingEvent.findFirst({
    where: { listingId, type: ARRIVED, actorId: userId },
    select: { id: true },
  });
  if (existing) return { alreadyArrived: true };

  const dropOff = pickup.listing.dropOff;
  await db.listingEvent.create({
    data: { listingId, type: ARRIVED, actorId: userId },
  });

  // A line in the coordination thread is what actually reaches the drop-off and
  // the restaurant — the same seam the pickup notice uses.
  await db.message.create({
    data: {
      listingId,
      senderId: userId,
      body: dropOff
        ? `I'm here at ${dropOff.name}.`
        : "I've arrived at the drop-off.",
    },
  });

  return { alreadyArrived: false };
}

/** Who is allowed to acknowledge receipt for a drop-off. */
export type ReceiptActor = {
  id: string;
  role: string;
  dropOffId: string | null;
};

/**
 * The drop-off confirms the food actually reached them.
 *
 * Until now a delivery was asserted solely by the person walking away from it.
 * This gives the receiving end — the one party that knows for certain whether
 * the food arrived — a way to say so, and gives the restaurant a second
 * signal that isn't the volunteer's own word.
 */
export async function confirmReceiptFor(
  db: Db,
  actor: ReceiptActor,
  listingId: string
): Promise<{ alreadyConfirmed: boolean }> {
  const listing = await db.foodListing.findUnique({
    where: { id: listingId },
    select: { id: true, status: true, dropOffId: true },
  });
  if (!listing) throw new Error("That rescue no longer exists.");

  // Only this listing's own drop-off, or an org admin overseeing the chapter.
  const ownsDropOff =
    actor.role === "drop_off" &&
    actor.dropOffId != null &&
    actor.dropOffId === listing.dropOffId;
  if (!ownsDropOff && actor.role !== "org_admin") {
    throw new Error("Only the drop-off can confirm they received this.");
  }

  // Receipt follows delivery — confirming food that nobody has dropped off yet
  // would be recording something that hasn't happened.
  if (listing.status !== "delivered") {
    throw new Error("This rescue hasn't been delivered yet.");
  }

  const existing = await db.listingEvent.findFirst({
    where: { listingId, type: RECEIVED },
    select: { id: true },
  });
  if (existing) return { alreadyConfirmed: true };

  await db.listingEvent.create({
    data: { listingId, type: RECEIVED, actorId: actor.id },
  });
  return { alreadyConfirmed: false };
}
