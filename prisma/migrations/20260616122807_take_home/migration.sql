-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'taken_home';

-- AlterTable
ALTER TABLE "Pickup" ADD COLUMN     "deliverBy" TIMESTAMP(3),
ADD COLUMN     "takenHomeAt" TIMESTAMP(3);
