-- CreateEnum
CREATE TYPE "DropOffNoticeKind" AS ENUM ('hours', 'conditions', 'general');

-- CreateTable
CREATE TABLE "DropOffNotice" (
    "id" TEXT NOT NULL,
    "dropOffId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" "DropOffNoticeKind" NOT NULL DEFAULT 'general',
    "body" TEXT NOT NULL,
    "until" TIMESTAMP(3),
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DropOffNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DropOffNotice_dropOffId_createdAt_idx" ON "DropOffNotice"("dropOffId", "createdAt");

-- AddForeignKey
ALTER TABLE "DropOffNotice" ADD CONSTRAINT "DropOffNotice_dropOffId_fkey" FOREIGN KEY ("dropOffId") REFERENCES "DropOff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropOffNotice" ADD CONSTRAINT "DropOffNotice_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
