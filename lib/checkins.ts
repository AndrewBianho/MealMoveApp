import { prisma } from "./prisma";
import { dueNudgeCount } from "./checkin-marks";
import { sendCheckInPush } from "./notify";

// A structural slice of the Prisma client — just the methods these functions
// touch. Lets tests inject a fake db without standing up a database.
type Db = Pick<
  typeof prisma,
  "pickup" | "foodListing" | "listingEvent" | "$transaction"
>;

/**
 * Fire any due check-up nudges for active claims. Idempotent: tracks how many
 * marks it has already dispatched via Pickup.nudgesSent, so repeated cron runs
 * never double-notify. Marks at 5 and 10 min; the 15-min auto-cancel is the
 * sweep's job, not ours.
 */
export async function dispatchCheckIns(
  db: Db = prisma,
  now: number = Date.now(),
  notify = sendCheckInPush
): Promise<{ nudged: number }> {
  const pickups = await db.pickup.findMany({
    where: { listing: { status: "claimed" } },
    include: { listing: true },
  });

  let nudged = 0;
  for (const p of pickups) {
    const due = dueNudgeCount(p.claimedAt.getTime(), now);
    if (due <= p.nudgesSent) continue;
    for (let markIndex = p.nudgesSent + 1; markIndex <= due; markIndex++) {
      await notify({
        pickupId: p.id,
        listingId: p.listingId,
        volunteerId: p.volunteerId,
        listingTitle: p.listing.title,
        markIndex,
      });
      nudged++;
    }
    await db.pickup.update({ where: { id: p.id }, data: { nudgesSent: due } });
  }
  return { nudged };
}

/** Guard: load the active claim for this listing owned by this user, or throw. */
async function loadOwnedClaim(db: Db, userId: string, listingId: string) {
  const pickup = await db.pickup.findUnique({
    where: { listingId },
    include: { listing: true },
  });
  if (
    !pickup ||
    pickup.volunteerId !== userId ||
    pickup.listing.status !== "claimed"
  ) {
    throw new Error("This pickup is no longer active.");
  }
  return pickup;
}

/** Record a liveness confirmation. Does NOT extend the hold (liveness-only). */
export async function confirmCheckInFor(
  db: Db,
  userId: string,
  listingId: string,
  now: number = Date.now()
): Promise<void> {
  await loadOwnedClaim(db, userId, listingId);
  await db.$transaction([
    db.pickup.update({
      where: { listingId },
      data: { lastCheckInAt: new Date(now) },
    }),
    db.listingEvent.create({
      data: { listingId, type: "checked_in", actorId: userId },
    }),
  ]);
}

/** Voluntarily release a claim — reopens the listing; logged non-punitively. */
export async function releaseClaimFor(
  db: Db,
  userId: string,
  listingId: string
): Promise<void> {
  await loadOwnedClaim(db, userId, listingId);
  await db.$transaction([
    db.pickup.delete({ where: { listingId } }),
    db.foodListing.update({
      where: { id: listingId },
      data: { status: "open" },
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
}
