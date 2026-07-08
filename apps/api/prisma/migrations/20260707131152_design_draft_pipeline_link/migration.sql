-- AlterTable
ALTER TABLE "DesignDraft" ADD COLUMN     "postPackageId" TEXT,
ADD COLUMN     "visualPackageId" TEXT;

-- CreateIndex
CREATE INDEX "DesignDraft_postPackageId_idx" ON "DesignDraft"("postPackageId");
