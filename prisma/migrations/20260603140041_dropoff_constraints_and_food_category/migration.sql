-- CreateEnum
CREATE TYPE "FoodCategory" AS ENUM ('prepared', 'produce', 'bakery', 'packaged', 'dairy', 'beverages');

-- AlterTable
ALTER TABLE "DropOff" ADD COLUMN     "acceptedCategories" "FoodCategory"[],
ADD COLUMN     "capacity" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "refrigerated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FoodListing" ADD COLUMN     "category" "FoodCategory" NOT NULL DEFAULT 'prepared',
ADD COLUMN     "perishable" BOOLEAN NOT NULL DEFAULT false;
