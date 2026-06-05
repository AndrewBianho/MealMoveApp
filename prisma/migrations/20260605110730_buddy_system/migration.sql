-- CreateEnum
CREATE TYPE "BuddyInviteStatus" AS ENUM ('pending', 'accepted', 'declined', 'cancelled');

-- AlterTable
ALTER TABLE "Pickup" ADD COLUMN     "buddyId" TEXT;

-- CreateTable
CREATE TABLE "BuddyInvite" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "status" "BuddyInviteStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "BuddyInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuddyInvite_inviteeId_status_idx" ON "BuddyInvite"("inviteeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BuddyInvite_listingId_inviteeId_key" ON "BuddyInvite"("listingId", "inviteeId");

-- CreateIndex
CREATE INDEX "Pickup_buddyId_idx" ON "Pickup"("buddyId");

-- AddForeignKey
ALTER TABLE "Pickup" ADD CONSTRAINT "Pickup_buddyId_fkey" FOREIGN KEY ("buddyId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuddyInvite" ADD CONSTRAINT "BuddyInvite_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "FoodListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuddyInvite" ADD CONSTRAINT "BuddyInvite_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuddyInvite" ADD CONSTRAINT "BuddyInvite_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
