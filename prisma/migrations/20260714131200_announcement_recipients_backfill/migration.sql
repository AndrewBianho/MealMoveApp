-- Backfill: every announcement created before targeting went to all active
-- volunteers in its world.
UPDATE "Announcement" a
SET "recipientIds" = COALESCE((
  SELECT array_agg(u."id") FROM "User" u
  WHERE u."role" = 'volunteer' AND u."status" = 'active'
    AND u."dataMode" = (CASE WHEN a."demo" THEN 'demo'::"DataMode" ELSE 'real'::"DataMode" END)
), ARRAY[]::TEXT[])
WHERE a."recipientIds" IS NULL OR cardinality(a."recipientIds") = 0;
