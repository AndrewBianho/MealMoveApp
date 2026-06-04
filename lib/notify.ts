import { CHECK_IN_MARKS } from "./checkin-marks";

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
