-- DropIndex
DROP INDEX "Pickup_listingId_key";

-- CreateIndex
CREATE INDEX "Pickup_listingId_idx" ON "Pickup"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "Pickup_listingId_volunteerId_key" ON "Pickup"("listingId", "volunteerId");

