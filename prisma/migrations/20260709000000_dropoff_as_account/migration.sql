-- Drop-off becomes a first-class, per-location partner account (mirrors
-- restaurant) instead of a chapter-wide admin role. Existing chapter-wide
-- drop_off_admin accounts are folded into org_admin.

-- 1. Rename the role value. `drop_off_admin` rows now read as `drop_off`.
ALTER TYPE "Role" RENAME VALUE 'drop_off_admin' TO 'drop_off';

-- 2. Fold the old chapter-wide admins into org_admin. At this point every
--    `drop_off` row is a former admin (no per-location accounts exist yet).
UPDATE "User" SET "role" = 'org_admin' WHERE "role" = 'drop_off';

-- 3. The drop-off's self-reported appetite for food.
CREATE TYPE "NeedLevel" AS ENUM ('low', 'steady', 'high');
ALTER TABLE "DropOff" ADD COLUMN "needLevel" "NeedLevel" NOT NULL DEFAULT 'steady';

-- 4. Link a drop_off account to the single location it speaks for.
ALTER TABLE "User" ADD COLUMN "dropOffId" TEXT;
ALTER TABLE "User"
  ADD CONSTRAINT "User_dropOffId_fkey"
  FOREIGN KEY ("dropOffId") REFERENCES "DropOff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Team invites now target a specific drop-off (an account speaks for one
--    location). Cancel any pending chapter-wide drop-off invites — their
--    semantics no longer exist.
ALTER TABLE "TeamInvite" ADD COLUMN "dropOffId" TEXT;
UPDATE "TeamInvite" SET "status" = 'cancelled' WHERE "role" = 'drop_off' AND "status" = 'pending';
