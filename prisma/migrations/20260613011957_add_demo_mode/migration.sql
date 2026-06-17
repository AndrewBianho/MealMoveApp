-- CreateEnum
CREATE TYPE "DataMode" AS ENUM ('real', 'demo');

-- DropIndex
DROP INDEX "FoodListing_status_expiresAt_idx";

-- AlterTable
ALTER TABLE "DropOff" ADD COLUMN     "demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FoodListing" ADD COLUMN     "demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dataMode" "DataMode" NOT NULL DEFAULT 'real';

-- CreateIndex
CREATE INDEX "FoodListing_demo_status_expiresAt_idx" ON "FoodListing"("demo", "status", "expiresAt");
