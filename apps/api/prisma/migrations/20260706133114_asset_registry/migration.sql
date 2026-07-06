-- DropForeignKey
ALTER TABLE "AssetLibraryItem" DROP CONSTRAINT "AssetLibraryItem_clientCompanyId_fkey";

-- AlterTable
ALTER TABLE "AssetLibraryItem" ADD COLUMN     "aiPrompt" TEXT,
ADD COLUMN     "allowedUseNotes" TEXT,
ADD COLUMN     "attributionRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "commercialUse" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "contentUrl" TEXT,
ADD COLUMN     "creator" TEXT,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "licence" TEXT,
ADD COLUMN     "modificationAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerId" TEXT,
ADD COLUMN     "restrictedFlags" TEXT[],
ADD COLUMN     "retrievedAt" TIMESTAMP(3),
ADD COLUMN     "shared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "thumbUrl" TEXT,
ADD COLUMN     "usageTier" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "width" INTEGER,
ALTER COLUMN "clientCompanyId" DROP NOT NULL,
ALTER COLUMN "storageKey" DROP NOT NULL,
ALTER COLUMN "sizeBytes" SET DEFAULT 0,
ALTER COLUMN "uploadedById" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "AssetLibraryItem_shared_type_idx" ON "AssetLibraryItem"("shared", "type");

-- CreateIndex
CREATE INDEX "AssetLibraryItem_provider_providerId_idx" ON "AssetLibraryItem"("provider", "providerId");

-- AddForeignKey
ALTER TABLE "AssetLibraryItem" ADD CONSTRAINT "AssetLibraryItem_clientCompanyId_fkey" FOREIGN KEY ("clientCompanyId") REFERENCES "ClientCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
