-- Drop the 15-minute claim hold.
--
-- A claim no longer expires on its own: `holdUntil` drove the sweep's
-- auto-release pass, which deleted any unphotographed pickup past its deadline
-- and returned the listing to the feed. Both the column and that pass are gone,
-- so a claim now stands until the volunteer delivers it or releases it by hand.
ALTER TABLE "Pickup" DROP COLUMN "holdUntil";
