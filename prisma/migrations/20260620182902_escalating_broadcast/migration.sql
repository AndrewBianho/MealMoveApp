-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ListingBroadcast" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListingBroadcast_listingId_idx" ON "ListingBroadcast"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingBroadcast_listingId_volunteerId_band_key" ON "ListingBroadcast"("listingId", "volunteerId", "band");

-- AddForeignKey
ALTER TABLE "ListingBroadcast" ADD CONSTRAINT "ListingBroadcast_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "FoodListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingBroadcast" ADD CONSTRAINT "ListingBroadcast_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
