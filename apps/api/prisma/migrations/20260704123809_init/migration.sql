-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('AGENCY', 'COMPANY');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PLATFORM_OWNER', 'AGENCY_ADMIN', 'CLIENT_ADMIN', 'BRAND_MANAGER', 'CONTENT_STRATEGIST', 'DESIGNER', 'REVIEWER', 'APPROVER', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApprovableStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'CHANGES_REQUESTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('SUGGESTED', 'APPROVED', 'REJECTED', 'EDITED');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('IDEA', 'DRAFTING', 'GENERATED', 'IN_REVIEW', 'NEEDS_CHANGES', 'APPROVED', 'EXPORTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RevisionReason" AS ENUM ('AI_GENERATED', 'AI_REGENERATED', 'HUMAN_EDIT', 'REVERT');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('LOGO', 'PHOTO', 'ICON', 'ILLUSTRATION', 'DOCUMENT', 'PREVIOUS_POST');

-- CreateEnum
CREATE TYPE "ApprovalEntity" AS ENUM ('BRAND_PROFILE', 'CONTENT_CALENDAR', 'POST_PACKAGE', 'VISUAL_PACKAGE');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrgType" NOT NULL DEFAULT 'COMPANY',
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "isPlatformOwner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientCompanyId" TEXT,
    "role" "Role" NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCompany" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "industry" TEXT,
    "websiteUrl" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandProfile" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ApprovableStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sourceInputs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandKit" (
    "id" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "colours" JSONB NOT NULL,
    "fonts" JSONB NOT NULL,
    "logos" JSONB NOT NULL,
    "iconStyle" TEXT NOT NULL DEFAULT 'outline',
    "photographyStyle" TEXT,
    "illustrationStyle" TEXT,
    "designDensity" TEXT NOT NULL DEFAULT 'balanced',

    CONSTRAINT "BrandKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleGuide" (
    "id" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "doRules" TEXT[],
    "dontRules" TEXT[],
    "approvedPhrases" TEXT[],
    "bannedPhrases" TEXT[],
    "complianceRules" TEXT[],
    "ctaStyles" TEXT[],
    "hashtagPreferences" JSONB,
    "layoutPreferences" JSONB,

    CONSTRAINT "StyleGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceToneProfile" (
    "id" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "toneDescriptors" TEXT[],
    "writingExamples" JSONB,
    "exampleLinkedInPosts" JSONB,
    "competitors" JSONB,
    "inspirationRefs" JSONB,

    CONSTRAINT "VoiceToneProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPillar" (
    "id" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ContentPillar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetAudience" (
    "id" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "painPoints" TEXT[],
    "goals" TEXT[],

    CONSTRAINT "TargetAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentCalendar" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ApprovableStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSlot" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "objective" TEXT NOT NULL,
    "pillarId" TEXT,
    "format" TEXT NOT NULL,
    "postPackageId" TEXT,
    "notes" TEXT,

    CONSTRAINT "CalendarSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostIdea" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "angle" TEXT,
    "objective" TEXT NOT NULL,
    "sourceMaterial" JSONB,
    "status" "IdeaStatus" NOT NULL DEFAULT 'SUGGESTED',
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostPackage" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "ideaId" TEXT,
    "internalTitle" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "targetAudienceId" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'IDEA',
    "hookOptions" JSONB,
    "mainText" TEXT,
    "shortVersion" TEXT,
    "longVersion" TEXT,
    "cta" TEXT,
    "hashtags" TEXT[],
    "firstComment" TEXT,
    "suggestedVisualFormat" TEXT,
    "carouselOutline" JSONB,
    "onImageText" JSONB,
    "slideTexts" JSONB,
    "altText" TEXT,
    "complianceNotes" TEXT,
    "qualityScore" DOUBLE PRECISION,
    "lockedFields" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisualPackage" (
    "id" TEXT NOT NULL,
    "postPackageId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "layoutRecipeId" TEXT,
    "conceptNotes" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFTING',

    CONSTRAINT "VisualPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignDocument" (
    "id" TEXT NOT NULL,
    "visualPackageId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "brandProfileId" TEXT NOT NULL,
    "internalDoc" JSONB NOT NULL,
    "engineDocCache" JSONB,
    "previewUrls" JSONB,
    "validationReport" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignRevision" (
    "id" TEXT NOT NULL,
    "designDocumentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "internalDoc" JSONB NOT NULL,
    "createdById" TEXT,
    "reason" "RevisionReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL,
    "postPackageId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdById" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetLibraryItem" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "brandProfileId" TEXT,
    "type" "AssetType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "tags" TEXT[],
    "campaign" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "allowInPrompts" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetLibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRecord" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "entityType" "ApprovalEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "gate" INTEGER NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "decidedById" TEXT NOT NULL,
    "note" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "elementId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportRecord" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT,
    "exportedById" TEXT NOT NULL,
    "exportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientCompanyId" TEXT,
    "userId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientCompanyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "promptVersion" TEXT,
    "model" TEXT,
    "tokensUsed" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE INDEX "Membership_clientCompanyId_idx" ON "Membership"("clientCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organisationId_clientCompanyId_role_key" ON "Membership"("userId", "organisationId", "clientCompanyId", "role");

-- CreateIndex
CREATE INDEX "ClientCompany_organisationId_idx" ON "ClientCompany"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCompany_organisationId_slug_key" ON "ClientCompany"("organisationId", "slug");

-- CreateIndex
CREATE INDEX "BrandProfile_clientCompanyId_idx" ON "BrandProfile"("clientCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandKit_brandProfileId_key" ON "BrandKit"("brandProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "StyleGuide_brandProfileId_key" ON "StyleGuide"("brandProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceToneProfile_brandProfileId_key" ON "VoiceToneProfile"("brandProfileId");

-- CreateIndex
CREATE INDEX "ContentPillar_brandProfileId_idx" ON "ContentPillar"("brandProfileId");

-- CreateIndex
CREATE INDEX "TargetAudience_brandProfileId_idx" ON "TargetAudience"("brandProfileId");

-- CreateIndex
CREATE INDEX "ContentCalendar_clientCompanyId_idx" ON "ContentCalendar"("clientCompanyId");

-- CreateIndex
CREATE INDEX "CalendarSlot_calendarId_idx" ON "CalendarSlot"("calendarId");

-- CreateIndex
CREATE INDEX "PostIdea_clientCompanyId_idx" ON "PostIdea"("clientCompanyId");

-- CreateIndex
CREATE INDEX "PostPackage_clientCompanyId_status_idx" ON "PostPackage"("clientCompanyId", "status");

-- CreateIndex
CREATE INDEX "VisualPackage_postPackageId_idx" ON "VisualPackage"("postPackageId");

-- CreateIndex
CREATE UNIQUE INDEX "DesignDocument_visualPackageId_key" ON "DesignDocument"("visualPackageId");

-- CreateIndex
CREATE INDEX "DesignDocument_clientCompanyId_idx" ON "DesignDocument"("clientCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "DesignRevision_designDocumentId_version_key" ON "DesignRevision"("designDocumentId", "version");

-- CreateIndex
CREATE INDEX "Revision_postPackageId_idx" ON "Revision"("postPackageId");

-- CreateIndex
CREATE INDEX "AssetLibraryItem_clientCompanyId_type_approved_idx" ON "AssetLibraryItem"("clientCompanyId", "type", "approved");

-- CreateIndex
CREATE INDEX "ApprovalRecord_entityType_entityId_idx" ON "ApprovalRecord"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Comment_entityType_entityId_idx" ON "Comment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ExportRecord_entityType_entityId_idx" ON "ExportRecord"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_organisationId_at_idx" ON "AuditEvent"("organisationId", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "GenerationJob_clientCompanyId_createdAt_idx" ON "GenerationJob"("clientCompanyId", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_clientCompanyId_fkey" FOREIGN KEY ("clientCompanyId") REFERENCES "ClientCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCompany" ADD CONSTRAINT "ClientCompany_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandProfile" ADD CONSTRAINT "BrandProfile_clientCompanyId_fkey" FOREIGN KEY ("clientCompanyId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleGuide" ADD CONSTRAINT "StyleGuide_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceToneProfile" ADD CONSTRAINT "VoiceToneProfile_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPillar" ADD CONSTRAINT "ContentPillar_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetAudience" ADD CONSTRAINT "TargetAudience_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCalendar" ADD CONSTRAINT "ContentCalendar_clientCompanyId_fkey" FOREIGN KEY ("clientCompanyId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSlot" ADD CONSTRAINT "CalendarSlot_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "ContentCalendar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostIdea" ADD CONSTRAINT "PostIdea_clientCompanyId_fkey" FOREIGN KEY ("clientCompanyId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPackage" ADD CONSTRAINT "PostPackage_clientCompanyId_fkey" FOREIGN KEY ("clientCompanyId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualPackage" ADD CONSTRAINT "VisualPackage_postPackageId_fkey" FOREIGN KEY ("postPackageId") REFERENCES "PostPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignDocument" ADD CONSTRAINT "DesignDocument_visualPackageId_fkey" FOREIGN KEY ("visualPackageId") REFERENCES "VisualPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignRevision" ADD CONSTRAINT "DesignRevision_designDocumentId_fkey" FOREIGN KEY ("designDocumentId") REFERENCES "DesignDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_postPackageId_fkey" FOREIGN KEY ("postPackageId") REFERENCES "PostPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetLibraryItem" ADD CONSTRAINT "AssetLibraryItem_clientCompanyId_fkey" FOREIGN KEY ("clientCompanyId") REFERENCES "ClientCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
