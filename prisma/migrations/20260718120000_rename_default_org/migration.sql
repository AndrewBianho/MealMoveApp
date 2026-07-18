-- Rename the default (fallback) organization from "Campus Food Rescue" to "None".
-- The original name was inserted by 20260716151233_volunteer_organizations; that
-- migration is already applied, so it is left untouched (editing an applied
-- migration breaks Prisma's checksum check). This forward migration is
-- idempotent: on a fresh database it corrects the seeded name, and on the live
-- database (already renamed out-of-band) it is a no-op.
UPDATE "Organization" SET "name" = 'None' WHERE "id" = 'org_default_cfr';
