import { prisma } from "./prisma";
import { isOnClaim } from "./buddies";
import { sendDropOffPickupNotice } from "./notify";

// A structural slice of the Prisma client — just the methods these functions
// touch. Lets tests inject a fake db without standing up a database.
type Db = Pick<
  typeof prisma,
  "pickup" | "foodListing" | "listingEvent" | "message" | "$transaction"
>;

/**
 * Guard: load the claim in the expected status that this user is on — either the
 * primary volunteer or the buddy (so either can capture the proof photo) — or throw.
 */
async function loadClaimInStatus(
  db: Db,
  userId: string,
  listingId: string,
  status: "claimed" | "in_transit"
) {
  const pickup = await db.pickup.findUnique({
    where: { listingId },
    include: { listing: { include: { dropOff: true } } },
  });
  if (!pickup || !isOnClaim(pickup, userId) || pickup.listing.status !== status) {
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
  photoUrl: string,
  notify = sendDropOffPickupNotice
): Promise<void> {
  const url = photoUrl?.trim();
  if (!url) throw new Error("A pickup photo is required to start delivery.");
  const pickup = await loadClaimInStatus(db, userId, listingId, "claimed");
  const dropOff = pickup.listing.dropOff;

  // A durable "it's picked up" line in the coordination thread, posted from the
  // volunteer who captured the photo (a participant). The drop-off, restaurant,
  // and buddy all see it — the in-app counterpart to the push below.
  const body = dropOff
    ? `Picked up — on the way to ${dropOff.name} now.`
    : "Picked up — on the way now.";

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
  const pickup = await loadClaimInStatus(db, userId, listingId, "in_transit");

  // Credit every seat that showed up: a delivered event per volunteer (and the
  // buddy, if any) so reliability — which tallies delivered events per actor —
  // counts both. Whoever physically captured the photo owns the photo event.
  const seats = pickup.buddyId
    ? [pickup.volunteerId, pickup.buddyId]
    : [pickup.volunteerId];

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
    ...seats.map((id) =>
      db.listingEvent.create({
        data: { listingId, type: "delivered", actorId: id },
      })
    ),
  ]);
}
