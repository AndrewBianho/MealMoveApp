-- Check-up nudges removed: drop the "still on it" confirmation timestamp and
-- the dispatched-nudge counter from Pickup.
ALTER TABLE "Pickup" DROP COLUMN "lastCheckInAt",
DROP COLUMN "nudgesSent";
