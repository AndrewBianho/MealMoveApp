-- Quiet hours were removed from the product on 2026-09-03. The settings control
-- went first; dropping the columns is what actually frees anyone who had set a
-- window, since the enforcement in lib/broadcast.ts and lib/notify-dispatch.ts
-- kept honoring stored values after the UI to change them was gone.
--
-- Written by hand and NOT applied: this repo has no `migrate deploy` in CI, and
-- the local DATABASE_URL points at the shared hosted Supabase, so running
-- `prisma migrate dev` here would mutate the live database.
ALTER TABLE "User" DROP COLUMN IF EXISTS "quietHoursStart";
ALTER TABLE "User" DROP COLUMN IF EXISTS "quietHoursEnd";
