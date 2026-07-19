import { prisma } from "./prisma";
import { isOnClaim } from "./buddies";
import { sendRestaurantRescueNotice } from "./notify";

// A structural slice of the Prisma client — just the methods these functions
// touch. Lets tests inject a fake db without standing up a database.
type Db = Pick<
  typeof prisma,
  "pickup" | "foodListing" | "listingEvent" | "buddyInvite" | "$transaction"
>;

/**
 * Guard: load the active claim for this listing that this user is on — either
 * the primary volunteer or the buddy — or throw.
 */
async function loadOwnedClaim(db: Db, userId: string, listingId: string) {
  const pickup = await db.pickup.findFirst({
    where: {
      listingId,
      OR: [{ volunteerId: userId }, { buddyId: userId }],
    },
    include: { listing: true },
  });
  // The claim stage ends at the pickup photo; the listing may still be "open"
  // when it needs more cars than have claimed so far.
  if (
    !pickup ||
    !isOnClaim(pickup, userId) ||
    pickup.photoAtPickupUrl != null ||
    !["open", "claimed"].includes(pickup.listing.status)
  ) {
    throw new Error("This pickup is no longer active.");
  }
  return pickup;
}

/**
 * Voluntarily step off a claim, logged non-punitively. Buddy-aware so the
 * partner can cover solo:
 *   - the buddy leaving just clears their seat; the claim stays alive;
 *   - the primary leaving promotes the buddy to primary; the claim stays alive;
 *   - a sole volunteer leaving reopens the listing for everyone.
 */
export async function releaseClaimFor(
  db: Db,
  userId: string,
  listingId: string,
  notify = sendRestaurantRescueNotice
): Promise<void> {
  const pickup = await loadOwnedClaim(db, userId, listingId);

  // The buddy steps off — primary still has it, food unaffected.
  if (pickup.buddyId === userId) {
    await db.$transaction([
      db.pickup.update({ where: { id: pickup.id }, data: { buddyId: null } }),
      db.listingEvent.create({
        data: { listingId, type: "buddy_withdrawn", actorId: userId },
      }),
    ]);
    return;
  }

  // The primary steps off but a buddy is on it — promote the buddy so the
  // rescue survives. Listing stays claimed.
  if (pickup.buddyId) {
    await db.$transaction([
      db.pickup.update({
        where: { id: pickup.id },
        data: { volunteerId: pickup.buddyId, buddyId: null },
      }),
      db.listingEvent.create({
        data: {
          listingId,
          type: "withdrawn",
          actorId: userId,
          meta: { reason: "volunteer_released", promotedBuddy: pickup.buddyId },
        },
      }),
    ]);
    return;
  }

  // Sole volunteer on this claim — drop the claim and reopen the listing (a
  // multi-car listing simply falls back under capacity, so "open" is right
  // either way), and cancel this volunteer's pending buddy invites so a stale
  // one can't later attach a buddy to whoever re-claims. Other cars' claims
  // and invites on the same listing are untouched. When no other car remains,
  // the drop-off choice leaves with the claim — the destination is the
  // claiming volunteer's decision, so the next claimer picks their own.
  const otherCars = await db.pickup.count({
    where: { listingId, id: { not: pickup.id } },
  });
  await db.$transaction([
    db.pickup.delete({ where: { id: pickup.id } }),
    db.foodListing.update({
      where: { id: listingId },
      data: { status: "open", ...(otherCars === 0 ? { dropOffId: null } : {}) },
    }),
    db.buddyInvite.updateMany({
      where: { listingId, inviterId: userId, status: "pending" },
      data: { status: "cancelled", respondedAt: new Date() },
    }),
    db.listingEvent.create({
      data: {
        listingId,
        type: "withdrawn",
        actorId: userId,
        meta: { reason: "volunteer_released" },
      },
    }),
  ]);

  // The food lost its only volunteer — tell the restaurant it's back open so
  // they aren't left expecting a no-show. Only when no other car still covers.
  // Best-effort: the release already committed, so a push failure must not throw.
  if (otherCars === 0) {
    try {
      await notify({
        event: "fell_through",
        restaurantId: pickup.listing.restaurantId,
        listingId,
        listingTitle: pickup.listing.title,
      });
    } catch {
      // best-effort notification
    }
  }
}
