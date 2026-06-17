-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('pending', 'active');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pendingOrg" JSONB,
ADD COLUMN     "status" "AccountStatus" NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");
