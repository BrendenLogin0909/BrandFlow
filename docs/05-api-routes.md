# BrandFlow — API Routes

**Version:** 1.0 · **Date:** 2026-07-04

All routes are prefixed `/api`. Auth: `Authorization: Bearer <JWT>`. All client-scoped routes live under `/clients/:clientId/...` and the middleware verifies the caller's membership for that client before the handler runs. Long-running operations return `202 { jobId }`; poll `/jobs/:jobId`.

## Auth

| Method | Route | Purpose | Capability |
|---|---|---|---|
| POST | `/auth/register` | Create platform account + organisation | public |
| POST | `/auth/login` | Login → JWT + refresh | public |
| POST | `/auth/refresh` | Rotate tokens | public |
| GET | `/auth/me` | Current user + memberships | any |

## Organisation & users

| Method | Route | Purpose | Capability |
|---|---|---|---|
| GET/PATCH | `/org` | Read/update organisation | `org:read` / `org:manage` |
| GET/POST | `/org/users` | List / invite users | `users:manage` |
| PATCH/DELETE | `/org/users/:userId` | Update role/memberships, deactivate | `users:manage` |
| GET/POST | `/clients` | List (only assigned) / create client company | `clients:read` / `clients:manage` |
| GET/PATCH/DELETE | `/clients/:clientId` | Read / update / archive | `clients:read` / `clients:manage` |

## Brand profiles (Gate 1)

| Method | Route | Purpose | Capability |
|---|---|---|---|
| GET/POST | `/clients/:clientId/brand-profiles` | List / create (blank or AI-assisted) | `brand:read` / `brand:manage` |
| GET/PATCH | `/clients/:clientId/brand-profiles/:id` | Read / edit any section | `brand:read` / `brand:manage` |
| POST | `.../brand-profiles/:id/analyze` | 202 — AI brand analysis + draft from inputs (URLs, uploaded file refs, questionnaire) | `brand:manage` |
| POST | `.../brand-profiles/:id/submit` | Move to PENDING_APPROVAL | `brand:manage` |
| POST | `.../brand-profiles/:id/approve` | Gate 1 decision `{ decision, note }` | `brand:approve` |
| GET/PATCH | `.../brand-profiles/:id/kit` | Brand kit (colours/fonts/logos) | `brand:read` / `brand:manage` |
| GET/PATCH | `.../brand-profiles/:id/style-guide` | Style guide | same |
| GET/PATCH | `.../brand-profiles/:id/voice` | Voice/tone profile | same |
| GET/POST/PATCH/DELETE | `.../brand-profiles/:id/pillars[/:pillarId]` | Content pillars | same |
| GET/POST/PATCH/DELETE | `.../brand-profiles/:id/audiences[/:audienceId]` | Target audiences | same |

## Content strategy & calendar (Gate 2)

| Method | Route | Purpose | Capability |
|---|---|---|---|
| POST | `/clients/:clientId/calendars/generate` | 202 — AI content strategy/calendar draft | `content:generate` |
| GET/POST | `/clients/:clientId/calendars` | List / create manual | `content:read` / `content:edit` |
| GET/PATCH | `/clients/:clientId/calendars/:id` | Read / edit slots | same |
| POST | `.../calendars/:id/approve` | Gate 2 decision | `content:approve` |
| GET | `.../calendars/:id/export.csv` | CSV export | `content:export` |

## Ideas & post packages (Gate 3)

| Method | Route | Purpose | Capability |
|---|---|---|---|
| POST | `/clients/:clientId/ideas/suggest` | 202 — AI post ideas `{ brandProfileId, objective, sourceMaterial? }` | `content:generate` |
| GET/POST/PATCH | `/clients/:clientId/ideas[/:id]` | List / create / approve-edit-reject | `content:read` / `content:edit` |
| POST | `/clients/:clientId/post-packages/generate` | 202 — full package from approved idea | `content:generate` |
| GET/PATCH | `/clients/:clientId/post-packages[/:id]` | List (filter by status/brand/format) / edit fields | `content:read` / `content:edit` |
| POST | `.../post-packages/:id/regenerate` | 202 — part-level regen `{ part: hook\|cta\|mainText\|hashtags\|firstComment\|slide:<n>\|onImageHeadline\|... }`; locked fields preserved | `content:generate` |
| POST | `.../post-packages/:id/lock` | Lock/unlock fields `{ fields[], locked }` | `content:edit` |
| POST | `.../post-packages/:id/status` | Workflow transition (submit for review, request changes) | `content:edit` / `content:review` |
| POST | `.../post-packages/:id/approve` | Gate 3 decision | `content:approve` |
| GET | `.../post-packages/:id/revisions` | Revision history | `content:read` |

## Visual packages & design documents

| Method | Route | Purpose | Capability |
|---|---|---|---|
| POST | `.../post-packages/:id/visual/generate` | 202 — visual concept + design doc `{ format?, recipeId? }` | `content:generate` |
| GET | `.../visual-packages/:id` | Visual package + validation report + preview URLs | `content:read` |
| GET | `.../design-documents/:id` | InternalDesignDocument (authoritative) | `content:read` |
| GET | `.../design-documents/:id/engine` | Derived Polotno scene JSON for the editor | `content:read` |
| PUT | `.../design-documents/:id` | Save human edits (Internal schema; server re-validates) | `design:edit` |
| POST | `.../design-documents/:id/regenerate` | 202 — part regen `{ part: concept\|layout\|icons\|background\|colours\|slide:<n>\|all }`, locked elements preserved | `content:generate` |
| POST | `.../design-documents/:id/lock-elements` | Lock/unlock elements `{ elementIds[], locked }` | `design:edit` |
| POST | `.../design-documents/:id/validate` | Run validation, return report | `content:read` |
| GET | `.../design-documents/:id/revisions[/:version]` | List / fetch / revert design revisions | `design:edit` |

## Assets

| Method | Route | Purpose | Capability |
|---|---|---|---|
| GET/POST | `/clients/:clientId/assets` | List (filters: type/tag/campaign/brand/approved) / upload (multipart) | `assets:read` / `assets:manage` |
| GET/PATCH/DELETE | `/clients/:clientId/assets/:id` | Read / tag, approve, allowInPrompts / remove | same |
| GET | `/clients/:clientId/assets/suggest?postPackageId=` | Metadata-based asset suggestions | `assets:read` |
| GET | `/icons/search?q=&style=` | Built-in licensed icon library search | any member |

## Comments, approvals, exports, audit

| Method | Route | Purpose | Capability |
|---|---|---|---|
| GET/POST | `/clients/:clientId/comments?entityType=&entityId=` | List / add (optional `elementId`) | `content:review` |
| PATCH | `/clients/:clientId/comments/:id` | Edit / resolve | author or `content:review` |
| GET | `/clients/:clientId/approvals?entityType=&entityId=` | Approval history | `content:read` |
| POST | `.../post-packages/:id/export` | 202 — `{ kind: png\|jpeg\|pdf\|slide_pngs\|design_json\|zip }` | `content:export` |
| GET | `/clients/:clientId/exports[/:id/download]` | List / signed download URL | `content:export` |
| GET | `/audit?clientId=&entityType=&from=&to=` | Audit log (org-scoped; client filter enforced by membership) | `audit:read` |
| GET | `/jobs/:jobId` | Poll job status/progress/result | job owner's tenant |

## Conventions

- Errors: `{ error: { code, message, details? } }`; 400 validation, 401 auth, 403 tenant/capability, 404 not-found-in-tenant (never reveals cross-tenant existence), 409 illegal workflow transition, 422 design validation failure (returns full validation report).
- All list endpoints: cursor pagination `?cursor=&limit=`.
- All mutating endpoints write AuditEvents.
