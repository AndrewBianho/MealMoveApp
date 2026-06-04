-- AlterTable
ALTER TABLE "Pickup" ADD COLUMN     "lastCheckInAt" TIMESTAMP(3),
ADD COLUMN     "nudgesSent" INTEGER NOT NULL DEFAULT 0;
