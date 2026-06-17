-- AlterTable
ALTER TABLE "FoodListing" ADD COLUMN     "availableAt" TIMESTAMP(3),
ADD COLUMN     "recurringPostId" TEXT;

-- CreateTable
CREATE TABLE "RecurringPost" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "servings" INTEGER NOT NULL,
    "weightLbs" DOUBLE PRECISION,
    "category" "FoodCategory" NOT NULL DEFAULT 'prepared',
    "perishable" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "imageUrl" TEXT,
    "daysOfWeek" INTEGER[],
    "timeOfDay" INTEGER NOT NULL,
    "windowMinutes" INTEGER NOT NULL DEFAULT 120,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringPost_active_idx" ON "RecurringPost"("active");

-- CreateIndex
CREATE INDEX "FoodListing_recurringPostId_availableAt_idx" ON "FoodListing"("recurringPostId", "availableAt");

-- AddForeignKey
ALTER TABLE "RecurringPost" ADD CONSTRAINT "RecurringPost_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodListing" ADD CONSTRAINT "FoodListing_recurringPostId_fkey" FOREIGN KEY ("recurringPostId") REFERENCES "RecurringPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
