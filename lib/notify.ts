import { CHECK_IN_MARKS } from "./checkin-marks";
import type { PrismaClient } from "@prisma/client";

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

/**
 * Integration seam for the check-up push notification. No-op until Firebase
 * Cloud Messaging is provisioned — this is the ONLY place FCM plugs in. When
 * wired, look up the volunteer's FCM token(s) and send via firebase-admin here.
 */
export async function sendCheckInPush(push: CheckInPush): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    const minutes = CHECK_IN_MARKS[push.markIndex - 1];
    console.log(
      `[check-in] would push volunteer ${push.volunteerId} at the ${minutes}-min mark for "${push.listingTitle}"`
    );
  }
}

export interface BuddyInvitePush {
  inviteId: string;
  listingId: string;
  inviteeId: string;
  listingTitle: string;
  inviterName: string;
}

/**
 * Integration seam for the buddy-invite push notification. No-op until Firebase
 * Cloud Messaging is provisioned — same seam pattern as `sendCheckInPush`. When
 * wired, look up the invitee's FCM token(s) and send via firebase-admin here.
 */
export async function sendBuddyInvitePush(push: BuddyInvitePush): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[buddy] would push volunteer ${push.inviteeId}: ${push.inviterName} invited you to buddy "${push.listingTitle}"`
    );
  }
}

export interface DropOffPickupNotice {
  listingId: string;
  dropOffId: string;
  dropOffName: string;
  listingTitle: string;
}

/**
 * Integration seam for the "your delivery is on its way" notice to a drop-off,
 * fired once a volunteer captures the pickup photo (claimed → in_transit). No-op
 * until Firebase Cloud Messaging is provisioned — same seam pattern as the other
 * pushes. When wired, notify the drop-off admins here (the schema doesn't tie an
 * admin to a specific DropOff, so this mirrors the /dropoff page and reaches all
 * drop-off admins).
 */
export async function sendDropOffPickupNotice(
  notice: DropOffPickupNotice
): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[drop-off] would notify ${notice.dropOffName}: "${notice.listingTitle}" was just picked up and is on its way.`
    );
  }
}
