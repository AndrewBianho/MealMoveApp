-- Add the super_admin role. Standalone ADD VALUE (not used in this migration),
-- safe under Postgres 12+ (Supabase is 15).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'super_admin';
