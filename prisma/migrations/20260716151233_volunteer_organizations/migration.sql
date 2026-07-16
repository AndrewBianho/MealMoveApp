-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "organizationId" TEXT;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailDomain" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_emailDomain_key" ON "Organization"("emailDomain");

-- CreateIndex
CREATE INDEX "Announcement_organizationId_createdAt_idx" ON "Announcement"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the two starting organizations.
INSERT INTO "Organization" ("id", "name", "emailDomain", "isDefault", "createdAt")
VALUES
  ('org_default_cfr', 'Campus Food Rescue', NULL, true, now()),
  ('org_malvern',     'Malvern', 'malvernprep.org', false, now());

-- Backfill existing volunteers and org admins into an organization by email
-- domain; unmatched fall back to the default org. Partners stay NULL.
UPDATE "User"
SET "organizationId" = 'org_malvern'
WHERE "role" IN ('volunteer', 'org_admin')
  AND lower(split_part("email", '@', 2)) = 'malvernprep.org';

UPDATE "User"
SET "organizationId" = 'org_default_cfr'
WHERE "role" IN ('volunteer', 'org_admin')
  AND "organizationId" IS NULL;

-- Existing announcements were chapter-wide; attach them to the default org so
-- the /updates inbox stays coherent.
UPDATE "Announcement"
SET "organizationId" = 'org_default_cfr'
WHERE "organizationId" IS NULL;
