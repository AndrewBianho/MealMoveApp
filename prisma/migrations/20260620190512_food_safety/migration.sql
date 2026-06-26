-- CreateEnum
CREATE TYPE "TempHandling" AS ENUM ('hot', 'cold', 'ambient');

-- AlterTable
ALTER TABLE "FoodListing" ADD COLUMN     "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tempHandling" "TempHandling";

-- AlterTable
ALTER TABLE "Pickup" ADD COLUMN     "safetyChecklist" JSONB;
