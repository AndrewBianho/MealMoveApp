import { prisma } from "./prisma";

// A structural slice of the Prisma client — just the methods these functions
// touch. Lets tests inject a fake db without standing up a database.
type Db = Pick<
  typeof prisma,
  "pickup" | "foodListing" | "listingEvent" | "$transaction"
>;

/** Guard: load this user's active claim in the expected status, or throw. */
async function loadClaimInStatus(
  db: Db,
  userId: string,
  listingId: string,
  status: "claimed" | "in_transit"
) {
  const pickup = await db.pickup.findUnique({
    where: { listingId },
    include: { listing: true },
  });
  if (
    !pickup ||
    pickup.volunteerId !== userId ||
    pickup.listing.status !== status
  ) {
    throw new Error("This pickup is no longer active.");
  }
  return pickup;
}

/**
 * Capture the pickup photo and advance claimed → in_transit. The photo is
 * required — without it the claim cannot move, which is the proof the chapter
 * keeps that a pickup actually happened.
 */
export async function startDeliveryWithPhotoFor(
  db: Db,
  userId: string,
  listingId: string,
  photoUrl: string
): Promise<void> {
  const url = photoUrl?.trim();
  if (!url) throw new Error("A pickup photo is required to start delivery.");
  await loadClaimInStatus(db, userId, listingId, "claimed");
  await db.$transaction([
    db.pickup.update({
      where: { listingId },
      data: { photoAtPickupUrl: url },
    }),
    db.foodListing.update({
      where: { id: listingId },
      data: { status: "in_transit" },
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
  ]);
}

/**
 * Capture the delivery photo and complete in_transit → delivered. Also stamps
 * deliveredAt. The photo is required, same as at pickup.
 */
export async function markDeliveredWithPhotoFor(
  db: Db,
  userId: string,
  listingId: string,
  photoUrl: string,
  now: number = Date.now()
): Promise<void> {
  const url = photoUrl?.trim();
  if (!url) throw new Error("A delivery photo is required to mark delivered.");
  await loadClaimInStatus(db, userId, listingId, "in_transit");
  await db.$transaction([
    db.pickup.update({
      where: { listingId },
      data: { photoAtDeliveryUrl: url, deliveredAt: new Date(now) },
    }),
    db.foodListing.update({
      where: { id: listingId },
      data: { status: "delivered" },
    }),
    db.listingEvent.create({
      data: {
        listingId,
        type: "photo_at_delivery",
        actorId: userId,
        meta: { photoUrl: url },
      },
    }),
    db.listingEvent.create({
      data: { listingId, type: "delivered", actorId: userId },
    }),
  ]);
}
