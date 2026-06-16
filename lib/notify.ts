import { CHECK_IN_MARKS } from "./checkin-marks";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { dispatchToUser, type NotifyPayload } from "./notify-dispatch";
import { absoluteUrl, escapeHtml } from "./email";

/**
 * Every account that shares a restaurant org. Multiple users can belong to one
 * restaurant (`User.restaurantId`), so any restaurant-facing push must fan out
 * to all of them — the seam below should target this whole list, not one user,
 * so notifications stay synced across teammates. (Drop-off admins are
 * chapter-wide, so `sendDropOffPickupNotice` already reaches every admin.)
 */
export async function restaurantMemberIds(
  db: Pick<PrismaClient, "user">,
  restaurantId: string
): Promise<string[]> {
  const members = await db.user.findMany({
    where: { restaurantId },
    select: { id: true },
  });
  return members.map((m) => m.id);
}

export interface CheckInPush {
  pickupId: string;
  listingId: string;
  volunteerId: string;
  listingTitle: string;
  /** 1-based nudge index: 1 → the 5-min mark, 2 → the 10-min mark. */
  markIndex: number;
}

export interface BuddyInvitePush {
  inviteId: string;
  listingId: string;
  inviteeId: string;
  listingTitle: string;
  inviterName: string;
}

export interface DropOffPickupNotice {
  listingId: string;
  dropOffId: string;
  dropOffName: string;
  listingTitle: string;
}

function emailButton(label: string, path: string): string {
  return `<p><a href="${absoluteUrl(path)}">${label}</a></p>`;
}

export function buildCheckInPayload(push: CheckInPush): NotifyPayload {
  const minutes = CHECK_IN_MARKS[push.markIndex - 1];
  const title = escapeHtml(push.listingTitle);
  return {
    title: "Still on for your pickup?",
    body: `Tap to check in on "${push.listingTitle}".`,
    url: `/listings/${push.listingId}`,
    email: {
      subject: "Checking in on your Meal Move pickup",
      html:
        `<p>You're ${minutes} minutes into your hold on "${title}". ` +
        `Tap below to confirm you're still on for it.</p>` +
        emailButton("Open the pickup", `/listings/${push.listingId}`),
    },
  };
}

export async function sendCheckInPush(push: CheckInPush): Promise<void> {
  await dispatchToUser(push.volunteerId, buildCheckInPayload(push));
}

export function buildBuddyInvitePayload(push: BuddyInvitePush): NotifyPayload {
  const title = escapeHtml(push.listingTitle);
  const inviter = escapeHtml(push.inviterName);
  return {
    title: "You've been invited to buddy a rescue",
    body: `${push.inviterName} invited you to "${push.listingTitle}".`,
    url: `/listings/${push.listingId}`,
    email: {
      subject: "A buddy invite on Meal Move",
      html:
        `<p>${inviter} invited you to buddy the pickup "${title}".</p>` +
        emailButton("See the invite", `/listings/${push.listingId}`),
    },
  };
}

export async function sendBuddyInvitePush(push: BuddyInvitePush): Promise<void> {
  await dispatchToUser(push.inviteeId, buildBuddyInvitePayload(push));
}

export function buildDropOffPayload(notice: DropOffPickupNotice): NotifyPayload {
  const title = escapeHtml(notice.listingTitle);
  return {
    title: "A delivery is on its way",
    body: `"${notice.listingTitle}" was just picked up.`,
    url: `/dropoff`,
    email: {
      subject: "An inbound delivery on Meal Move",
      html:
        `<p>"${title}" was just picked up and is on its way to ${escapeHtml(notice.dropOffName)}.</p>` +
        emailButton("View inbound deliveries", `/dropoff`),
    },
  };
}

// Reaches every drop-off admin (the schema doesn't tie an admin to one DropOff,
// mirroring the /dropoff page). Recipient lookup is injectable for tests.
export async function sendDropOffPickupNotice(
  notice: DropOffPickupNotice,
  deps: {
    recipientIds?: (db: Pick<PrismaClient, "user">) => Promise<string[]>;
    dispatch?: typeof dispatchToUser;
  } = {}
): Promise<void> {
  const dispatch = deps.dispatch ?? dispatchToUser;
  const recipientIds =
    deps.recipientIds ??
    (async (db) =>
      (
        await db.user.findMany({
          where: { role: "drop_off_admin" },
          select: { id: true },
        })
      ).map((u) => u.id));
  const ids = await recipientIds(prisma);
  const payload = buildDropOffPayload(notice);
  await Promise.all(ids.map((id) => dispatch(id, payload)));
}
