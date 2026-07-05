-- CreateTable
CREATE TABLE "DesignDraft" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "internalDoc" JSONB NOT NULL,
    "playgroundSource" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesignDraft_clientCompanyId_updatedAt_idx" ON "DesignDraft"("clientCompanyId", "updatedAt");
