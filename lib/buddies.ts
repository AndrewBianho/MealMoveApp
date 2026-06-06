import { prisma } from "./prisma";
import { sendBuddyInvitePush } from "./notify";

// A structural slice of the Prisma client — just the delegates these functions
// touch. Lets tests inject a fake db without standing up a database.
type Db = Pick<
  typeof prisma,
  "pickup" | "buddyInvite" | "listingEvent" | "user" | "$transaction"
>;

// A claim is "active" — open to buddy changes — while it's being worked.
const ACTIVE_STATUSES = ["claimed", "in_transit"];

/**
 * Is this user on the claim — either the primary volunteer or the buddy? The
 * single source of truth the per-claim guards (photos, check-ins, chat) share,
 * so both seats get the same access.
 */
export function isOnClaim(
  pickup: { volunteerId: string; buddyId: string | null },
  userId: string
): boolean {
  return pickup.volunteerId === userId || pickup.buddyId === userId;
}

/**
 * Volunteers the primary can invite to buddy this pickup: every volunteer except
 * the inviter, the current buddy, and anyone already holding a pending invite.
 */
export async function invitableVolunteers(
  db: Db,
  listingId: string,
  inviterId: string
): Promise<{ id: string; name: string }[]> {
  const [pickup, pending] = await Promise.all([
    db.pickup.findUnique({ where: { listingId }, select: { buddyId: true } }),
    db.buddyInvite.findMany({
      where: { listingId, status: "pending" },
      select: { inviteeId: true },
    }),
  ]);

  const exclude = new Set<string>([inviterId]);
  if (pickup?.buddyId) exclude.add(pickup.buddyId);
  for (const i of pending) exclude.add(i.inviteeId);

  return db.user.findMany({
    where: { role: "volunteer", id: { notIn: Array.from(exclude) } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * The primary volunteer invites a specific volunteer to do this pickup together.
 * Guards: only the primary may invite, the claim must be active, and it can't
 * already have a buddy. At most one outstanding invite per pickup. Idempotent if
 * re-inviting the same person (reopens a prior declined invite).
 */
export async function inviteBuddyFor(
  db: Db,
  inviterId: string,
  listingId: string,
  inviteeId: string,
  notify = sendBuddyInvitePush
): Promise<{ id: string }> {
  if (inviteeId === inviterId) throw new Error("You can't invite yourself.");

  const pickup = await db.pickup.findUnique({
    where: { listingId },
    include: { listing: true },
  });
  if (!pickup || !ACTIVE_STATUSES.includes(pickup.listing.status)) {
    throw new Error("This pickup is no longer active.");
  }
  if (pickup.volunteerId !== inviterId) {
    throw new Error("Only the volunteer who claimed this can invite a buddy.");
  }
  if (pickup.buddyId) throw new Error("This pickup already has a buddy.");

  const invitee = await db.user.findUnique({
    where: { id: inviteeId },
    select: { id: true, role: true },
  });
  if (!invitee || invitee.role !== "volunteer") {
    throw new Error("You can only invite a volunteer.");
  }

  // One outstanding invite at a time, so the UI shows a single clear pending state.
  const outstanding = await db.buddyInvite.findFirst({
    where: { listingId, status: "pending" },
  });
  if (outstanding && outstanding.inviteeId !== inviteeId) {
    throw new Error("You already have a pending buddy invite for this pickup.");
  }

  // Upsert so re-inviting after a decline reopens the same row (the
  // [listingId, inviteeId] uniqueness would otherwise reject a fresh create).
  const invite = await db.buddyInvite.upsert({
    where: { listingId_inviteeId: { listingId, inviteeId } },
    create: { listingId, inviterId, inviteeId, status: "pending" },
    update: { status: "pending", inviterId, respondedAt: null },
  });

  await db.listingEvent.create({
    data: {
      listingId,
      type: "buddy_invited",
      actorId: inviterId,
      meta: { inviteeId },
    },
  });

  const inviter = await db.user.findUnique({
    where: { id: inviterId },
    select: { name: true },
  });
  await notify({
    inviteId: invite.id,
    listingId,
    inviteeId,
    listingTitle: pickup.listing.title,
    inviterName: inviter?.name ?? "A volunteer",
  });

  return invite;
}

/**
 * The invitee accepts or declines. On accept the claim gains a buddy (still no
 * second Pickup row — just the buddyId seat). Guards re-check that the claim is
 * still active and buddy-less, since time may have passed since the invite.
 */
export async function respondToInviteFor(
  db: Db,
  inviteeId: string,
  inviteId: string,
  accept: boolean,
  now: number = Date.now()
): Promise<void> {
  const invite = await db.buddyInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.inviteeId !== inviteeId || invite.status !== "pending") {
    throw new Error("This invite is no longer available.");
  }

  if (!accept) {
    await db.buddyInvite.update({
      where: { id: inviteId },
      data: { status: "declined", respondedAt: new Date(now) },
    });
    return;
  }

  const pickup = await db.pickup.findUnique({
    where: { listingId: invite.listingId },
    include: { listing: true },
  });
  if (!pickup || !ACTIVE_STATUSES.includes(pickup.listing.status)) {
    throw new Error("This pickup is no longer active.");
  }
  if (pickup.buddyId) throw new Error("This pickup already has a buddy.");
  if (pickup.volunteerId === inviteeId) {
    throw new Error("You're already on this pickup.");
  }
  // The invite is only valid while its inviter is still the claim's primary. If
  // the claim was released and re-claimed (or the primary changed) since the
  // invite went out, it's stale — don't let it graft a buddy onto a pickup the
  // current volunteer never invited anyone to.
  if (pickup.volunteerId !== invite.inviterId) {
    throw new Error("This invite is no longer available.");
  }

  await db.$transaction([
    db.pickup.update({
      where: { listingId: invite.listingId },
      data: { buddyId: inviteeId },
    }),
    db.buddyInvite.update({
      where: { id: inviteId },
      data: { status: "accepted", respondedAt: new Date(now) },
    }),
    db.listingEvent.create({
      data: { listingId: invite.listingId, type: "buddy_joined", actorId: inviteeId },
    }),
  ]);
}

/**
 * The primary cancels an outstanding invite (pulls it back before a response).
 */
export async function cancelInviteFor(
  db: Db,
  inviterId: string,
  listingId: string,
  now: number = Date.now()
): Promise<void> {
  const invite = await db.buddyInvite.findFirst({
    where: { listingId, status: "pending" },
  });
  if (!invite || invite.inviterId !== inviterId) {
    throw new Error("There's no invite to cancel.");
  }
  await db.buddyInvite.update({
    where: { id: invite.id },
    data: { status: "cancelled", respondedAt: new Date(now) },
  });
}
