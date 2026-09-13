import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { dispatchToUser, type NotifyPayload } from "./notify-dispatch";
import { absoluteUrl, escapeHtml } from "./email";

/**
 * Every account that shares a restaurant org. Multiple users can belong to one
 * restaurant (`User.restaurantId`), so any restaurant-facing push must fan out
 * to all of them — the seam below should target this whole list, not one user,
 * so notifications stay synced across teammates.
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

/**
 * Every account that speaks for a drop-off location (`User.dropOffId`). Mirrors
 * restaurantMemberIds: a drop-off-facing push fans out to that location's
 * accounts only — not every drop-off in the chapter.
 */
export async function dropOffMemberIds(
  db: Pick<PrismaClient, "user">,
  dropOffId: string
): Promise<string[]> {
  const members = await db.user.findMany({
    where: { dropOffId },
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

// Reaches the accounts for the listing's specific drop-off location (the food is
// headed there), not every drop-off in the chapter. Recipient lookup is
// injectable for tests.
export async function sendDropOffPickupNotice(
  notice: DropOffPickupNotice,
  deps: {
    recipientIds?: (db: Pick<PrismaClient, "user">) => Promise<string[]>;
    dispatch?: typeof dispatchToUser;
  } = {}
): Promise<void> {
  const dispatch = deps.dispatch ?? dispatchToUser;
  const recipientIds =
    deps.recipientIds ?? ((db) => dropOffMemberIds(db, notice.dropOffId));
  const ids = await recipientIds(prisma);
  const payload = buildDropOffPayload(notice);
  await Promise.all(ids.map((id) => dispatch(id, payload)));
}

export type RestaurantRescueEvent = "claimed" | "delivered" | "fell_through";

export interface RestaurantRescueNotice {
  event: RestaurantRescueEvent;
  restaurantId: string;
  listingId: string;
  listingTitle: string;
  // Only the "claimed" event reads these; omit for delivered / fell_through.
  carsNeeded?: number | null;
  carsClaimed?: number;
}

// A restaurant-facing rescue update. Copy is sentence case and non-punitive —
// the fell-through case never names or blames the volunteer. Always links to the
// restaurant's own listings console.
export function buildRestaurantRescuePayload(
  notice: RestaurantRescueNotice
): NotifyPayload {
  const raw = notice.listingTitle;
  const title = escapeHtml(raw);
  const multiCar =
    notice.event === "claimed" &&
    notice.carsNeeded != null &&
    notice.carsNeeded > 1 &&
    notice.carsClaimed != null;

  let pushTitle: string;
  let pushBody: string;
  let bodyHtml: string;
  switch (notice.event) {
    case "claimed":
      if (multiCar) {
        pushTitle = "Your pickup was claimed";
        pushBody = `"${raw}" — ${notice.carsClaimed} of ${notice.carsNeeded} cars claimed.`;
        bodyHtml = `"${title}" — ${notice.carsClaimed} of ${notice.carsNeeded} cars claimed.`;
      } else {
        pushTitle = "Someone's coming for your pickup";
        pushBody = `A volunteer claimed "${raw}" and is on their way.`;
        bodyHtml = `A volunteer claimed "${title}" and is on their way.`;
      }
      break;
    case "delivered":
      pushTitle = "Your food was delivered";
      pushBody = `"${raw}" reached its drop-off. Thank you!`;
      bodyHtml = `"${title}" reached its drop-off. Thank you!`;
      break;
    case "fell_through":
      pushTitle = "Your pickup is open again";
      pushBody = `The volunteer for "${raw}" couldn't make it — it's back open and we're finding someone new.`;
      bodyHtml = `The volunteer for "${title}" couldn't make it — it's back open and we're finding someone new.`;
      break;
  }

  return {
    title: pushTitle,
    body: pushBody,
    url: `/restaurant/listings`,
    email: {
      subject: pushTitle,
      html: `<p>${bodyHtml}</p>` + emailButton("View your listings", `/restaurant/listings`),
    },
  };
}

// Fans out a rescue update to every account that shares the restaurant
// (User.restaurantId), via the existing per-user dispatch (which honors each
// member's opt-out and the push→email fallback). Best-effort:
// Promise.allSettled so one dead token / bounced email never rejects the batch.
// Recipient lookup and dispatch are injectable for tests.
export async function sendRestaurantRescueNotice(
  notice: RestaurantRescueNotice,
  deps: {
    recipientIds?: (db: Pick<PrismaClient, "user">) => Promise<string[]>;
    dispatch?: typeof dispatchToUser;
  } = {}
): Promise<void> {
  const dispatch = deps.dispatch ?? dispatchToUser;
  const recipientIds =
    deps.recipientIds ?? ((db) => restaurantMemberIds(db, notice.restaurantId));
  const ids = await recipientIds(prisma);
  const payload = buildRestaurantRescuePayload(notice);
  await Promise.allSettled(ids.map((id) => dispatch(id, payload)));
}
