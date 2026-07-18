-- CreateTable
CREATE TABLE "OrgAdminInvite" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "acceptedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "OrgAdminInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgAdminInvite_tokenHash_key" ON "OrgAdminInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "OrgAdminInvite_status_idx" ON "OrgAdminInvite"("status");

-- AddForeignKey
ALTER TABLE "OrgAdminInvite" ADD CONSTRAINT "OrgAdminInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
