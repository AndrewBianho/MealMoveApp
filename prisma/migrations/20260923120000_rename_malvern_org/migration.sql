-- Rename the Malvern organization from "Malvern" to "Malvern Prep". The original
-- name was inserted by 20260716151233_volunteer_organizations; that migration is
-- already applied, so it is left untouched (editing an applied migration breaks
-- Prisma's checksum check). This forward migration is idempotent: on a fresh
-- database it corrects the seeded name, and on a database already renamed
-- out-of-band it is a no-op. Mirrors 20260718120000_rename_default_org.
UPDATE "Organization" SET "name" = 'Malvern Prep' WHERE "id" = 'org_malvern';
