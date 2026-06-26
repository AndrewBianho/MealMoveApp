-- DropForeignKey
ALTER TABLE "AdminEvent" DROP CONSTRAINT "AdminEvent_targetId_fkey";

-- AlterTable
ALTER TABLE "AdminEvent" ALTER COLUMN "targetId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DropOff" ADD COLUMN     "contactInfo" TEXT,
ADD COLUMN     "lastContactAt" TIMESTAMP(3),
ADD COLUMN     "primaryContact" TEXT,
ADD COLUMN     "quirks" TEXT;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "contactInfo" TEXT,
ADD COLUMN     "lastContactAt" TIMESTAMP(3),
ADD COLUMN     "primaryContact" TEXT,
ADD COLUMN     "quirks" TEXT;

-- AddForeignKey
ALTER TABLE "AdminEvent" ADD CONSTRAINT "AdminEvent_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
