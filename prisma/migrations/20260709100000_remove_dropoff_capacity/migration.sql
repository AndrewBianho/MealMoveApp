-- Capacity is no longer a drop-off constraint: locations manage what they
-- accept (categories, refrigeration) and their need level, not a serving cap.
-- Eligibility no longer filters on it.
ALTER TABLE "DropOff" DROP COLUMN "capacity";
