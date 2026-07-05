-- AlterTable
ALTER TABLE "DesignDraft" ADD COLUMN     "ideaId" TEXT;

-- CreateIndex
CREATE INDEX "DesignDraft_ideaId_idx" ON "DesignDraft"("ideaId");
