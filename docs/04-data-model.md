# BrandFlow — Data Model

**Version:** 1.0 · **Date:** 2026-07-04
**Authoritative implementation:** [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma)

---

## 1. Entity overview

```
Organisation ─┬─ User ──── Membership(role, clientCompanyId?) 
              ├─ ClientCompany ─┬─ BrandProfile ─┬─ BrandKit
              │                 │                ├─ StyleGuide
              │                 │                ├─ VoiceToneProfile
              │                 │                ├─ ContentPillar[]
              │                 │                └─ TargetAudience[]
              │                 ├─ AssetLibraryItem[]
              │                 ├─ ContentCalendar ── CalendarSlot[]
              │                 ├─ PostIdea[]
              │                 └─ PostPackage ─┬─ VisualPackage ── DesignDocument ── DesignRevision[]
              │                                 ├─ ApprovalRecord[]
              │                                 ├─ Comment[]
              │                                 ├─ ExportRecord[]
              │                                 └─ Revision[]
              └─ AuditEvent[]
```

Every tenant-owned table carries `organisationId` and (where applicable) `clientCompanyId` for defence-in-depth scoping.

## 2. Entities

### Identity & tenancy

| Entity | Key fields | Notes |
|---|---|---|
| **Organisation** | id, name, type (`AGENCY`\|`COMPANY`), plan, createdAt | The tenant |
| **User** | id, email (unique), passwordHash, name, avatarUrl, isPlatformOwner | Platform account |
| **ClientCompany** | id, organisationId, name, slug, industry, websiteUrl, status | In-house org has one client company = itself |
| **Membership** | id, userId, organisationId, clientCompanyId (nullable = org-wide), role | Role enum; org-wide memberships only for AGENCY_ADMIN |
| **Role / Permission** | Role enum + capability map in code (`packages/shared`) | See [07-permission-model.md](07-permission-model.md) |

### Brand

| Entity | Key fields | Notes |
|---|---|---|
| **BrandProfile** | id, clientCompanyId, name, status (`DRAFT`\|`PENDING_APPROVAL`\|`APPROVED`\|`CHANGES_REQUESTED`\|`ARCHIVED`), approvedById, approvedAt, sourceInputs (JSON) | Gate 1 subject; only APPROVED profiles usable for generation |
| **BrandKit** | id, brandProfileId, colours (JSON: primary/secondary/accent/neutral + allowed extras), fonts (JSON: heading/body/accent + fallbacks), logos (asset refs + clearspace/min-size rules), iconStyle, photographyStyle, illustrationStyle, designDensity | The design tokens consumed by recipes |
| **StyleGuide** | id, brandProfileId, doRules[], dontRules[], approvedPhrases[], bannedPhrases[], complianceRules[], ctaStyles[], hashtagPreferences (JSON), layoutPreferences (JSON) | Writing + visual governance |
| **VoiceToneProfile** | id, brandProfileId, toneDescriptors[], writingExamples (JSON), exampleLinkedInPosts (JSON), competitors (JSON), inspirationRefs (JSON) | Feeds copy prompts |
| **ContentPillar** | id, brandProfileId, name, description, weight | |
| **TargetAudience** | id, brandProfileId, name, description, painPoints[], goals[] | |

### Content

| Entity | Key fields | Notes |
|---|---|---|
| **ContentCalendar** | id, clientCompanyId, brandProfileId, name, status (`DRAFT`\|`PENDING_APPROVAL`\|`APPROVED`), approvedById/At | Gate 2 subject |
| **CalendarSlot** | id, calendarId, date, objective, pillarId?, format, postPackageId?, notes | |
| **PostIdea** | id, clientCompanyId, brandProfileId, title, angle, objective, sourceMaterial (JSON), status (`SUGGESTED`\|`APPROVED`\|`REJECTED`\|`EDITED`), score | |
| **PostPackage** | id, clientCompanyId, brandProfileId, ideaId?, internalTitle, objective, targetAudienceId?, status (workflow enum), hookOptions (JSON), mainText, shortVersion, longVersion, cta, hashtags[], firstComment, suggestedVisualFormat, carouselOutline (JSON), onImageText (JSON), slideTexts (JSON), altText, complianceNotes, qualityScore, lockedFields[] | The core content object |
| **VisualPackage** | id, postPackageId, format, layoutRecipeId, conceptNotes, status, designDocumentId | |
| **DesignDocument** | id, visualPackageId, clientCompanyId, brandProfileId, internalDoc (JSONB = InternalDesignDocument), engineDocCache (JSONB, derived Polotno scene), previewUrls (JSON), validationReport (JSON), version | Internal schema is authoritative |
| **DesignRevision** | id, designDocumentId, version, internalDoc (JSONB), createdById, reason (`AI_GENERATED`\|`AI_REGENERATED`\|`HUMAN_EDIT`\|`REVERT`) | Full-document snapshots |
| **Revision** | id, postPackageId, snapshot (JSONB), createdById, reason | Post text revisions |

### Assets

| Entity | Key fields | Notes |
|---|---|---|
| **AssetLibraryItem** | id, clientCompanyId, brandProfileId?, type (`LOGO`\|`PHOTO`\|`ICON`\|`ILLUSTRATION`\|`DOCUMENT`\|`PREVIOUS_POST`), storageKey, filename, mimeType, sizeBytes, tags[], campaign?, approved (bool), allowInPrompts (bool, default false), usageCount, uploadedById | `approved=false` assets excluded from generation; `allowInPrompts` gates private content |

### Workflow & governance

| Entity | Key fields | Notes |
|---|---|---|
| **ApprovalRecord** | id, entityType (`BRAND_PROFILE`\|`CONTENT_CALENDAR`\|`POST_PACKAGE`\|`VISUAL_PACKAGE`), entityId, gate (1\|2\|3), decision (`APPROVED`\|`CHANGES_REQUESTED`), decidedById, note, decidedAt | One row per decision |
| **Comment** | id, entityType, entityId, elementId? (design-element anchor), authorId, body, resolved, parentId? | Element-level via elementId into InternalDesignDocument |
| **ExportRecord** | id, entityType, entityId, kind (`CLIPBOARD_TEXT`\|`PNG`\|`JPEG`\|`PDF`\|`SLIDE_PNGS`\|`DESIGN_JSON`\|`CALENDAR_CSV`\|`ZIP`), storageKey?, exportedById, exportedAt | |
| **AuditEvent** | id, organisationId, clientCompanyId?, userId?, entityType, entityId, action, before (JSONB?), after (JSONB?), at | Append-only |
| **GenerationJob** | id, clientCompanyId, kind (pipeline step), status, input (JSONB), output (JSONB), error?, tokensUsed, startedAt, finishedAt | AI observability + cost tracking |

## 3. Workflow status enum (PostPackage / VisualPackage)

`IDEA → DRAFTING → GENERATED → IN_REVIEW → NEEDS_CHANGES → APPROVED → EXPORTED → ARCHIVED`

Legal transitions are enforced in `ApprovalService`; every transition writes an AuditEvent.

## 4. Key constraints & indexes

- Unique: `User.email`, `(Membership.userId, organisationId, clientCompanyId, role)`, `ClientCompany.slug` per org.
- Indexes: `clientCompanyId` on all content tables; `(entityType, entityId)` on Comment/ApprovalRecord/ExportRecord/AuditEvent; `AssetLibraryItem (clientCompanyId, type, approved)`.
- FK cascade: deleting a ClientCompany is soft-delete only (`status=ARCHIVED`); hard deletes are a platform-owner operation with audit trail.
- JSONB columns validated by Zod at the service boundary — the DB never stores an InternalDesignDocument that failed schema validation.
