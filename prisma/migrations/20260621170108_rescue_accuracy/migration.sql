-- CreateEnum
CREATE TYPE "RescueAccuracy" AS ENUM ('yes', 'partly', 'no');

-- AlterTable
ALTER TABLE "Pickup" ADD COLUMN     "rescueAccuracy" "RescueAccuracy",
ADD COLUMN     "rescueAccuracyNote" TEXT;
