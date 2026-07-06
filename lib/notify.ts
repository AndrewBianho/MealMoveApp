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

export interface BroadcastPush {
  listingId: string;
  listingTitle: string;
  servings: number;
  minutesLeft: number;
  /** Time-left band driving the escalation; tunes the urgency of the copy. */
  band: "open" | "soon" | "closing_soon";
}

export function buildBroadcastPayload(push: BroadcastPush): NotifyPayload {
  const title = escapeHtml(push.listingTitle);
  const mins = Math.max(0, push.minutesLeft);
  const lead =
    push.band === "closing_soon"
      ? "Last call"
      : push.band === "soon"
        ? "Closing soon"
        : "Food to rescue";
  const servings = `${push.servings} ${push.servings === 1 ? "serving" : "servings"}`;
  return {
    title: `${lead}: ${push.listingTitle}`,
    body: `${servings} · about ${mins} min left. Tap to claim it.`,
    url: `/listings/${push.listingId}`,
    email: {
      subject: `${lead} — "${push.listingTitle}" needs a rescue`,
      html:
        `<p>"${title}" (${servings}) has about ${mins} minutes left before its ` +
        `pickup window closes. If you can grab it, tap below to claim it.</p>` +
        emailButton("Claim this pickup", `/listings/${push.listingId}`),
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
