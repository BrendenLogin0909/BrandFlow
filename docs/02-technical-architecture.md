# BrandFlow — Technical Architecture

**Version:** 1.0 · **Date:** 2026-07-04

---

## 1. Architecture overview

```
┌────────────────────────────────────────────────────────────────────┐
│  Frontend (React + TypeScript + Vite + Tailwind)                   │
│  • Role-aware dashboard  • Client/company switcher                 │
│  • Brand profile manager • Content calendar • Post package editor  │
│  • Embedded design editor (Polotno) • Asset library • Approvals    │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTPS / JSON (REST), JWT session
┌──────────────────────────────▼─────────────────────────────────────┐
│  API (Node.js + TypeScript + Fastify)                              │
│  • AuthN/AuthZ middleware (tenant scoping on every request)        │
│  • Route modules per domain  • Zod request/response validation     │
│  • Audit logging interceptor                                       │
├────────────────────────────────────────────────────────────────────┤
│  Domain services                                                   │
│  BrandService · ContentService · DesignService · AssetService      │
│  ApprovalService · ExportService · AuditService                    │
├───────────────┬───────────────────────────┬────────────────────────┤
│  Ports        │                           │                        │
│  AiProviderPort  DesignEnginePort  RendererPort  StoragePort       │
│  AuthPort        AssetProviderPort                                 │
├───────────────┴───────────────────────────┴────────────────────────┤
│  Adapters                                                          │
│  AnthropicAdapter · PolotnoAdapter · PolotnoRenderAdapter          │
│  S3StorageAdapter · LocalAuthAdapter · IconLibraryAdapter          │
└──────┬─────────────────┬───────────────────┬───────────────────────┘
       │                 │                   │
┌──────▼──────┐   ┌──────▼──────┐   ┌────────▼─────────┐
│ PostgreSQL  │   │ Object      │   │ Queue (BullMQ +  │
│ (Prisma)    │   │ storage     │   │ Redis) — AI jobs │
│ RLS-ready   │   │ (S3/MinIO)  │   │ render jobs      │
└─────────────┘   └─────────────┘   └──────────────────┘
```

## 2. Stack decisions

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS | Requirement; fastest path; Polotno is React-native |
| Editor | Polotno SDK embedded editor | See [03-design-engine-comparison.md](03-design-engine-comparison.md) |
| API | Fastify + TypeScript | Requirement; schema-first validation, fast, plugin ecosystem |
| Validation | Zod (shared schemas FE/BE) | One source of truth for request bodies and the design schema |
| ORM/DB | Prisma + PostgreSQL | Requirement; migrations, typed client; RLS optional hardening |
| Queue | BullMQ + Redis | AI generation and rendering are long-running; retries, progress |
| Storage | S3-compatible (AWS S3 prod, MinIO dev) | Assets, exports, uploaded brand material |
| AI | Anthropic Claude via AiProviderPort | Structured JSON output (tool-use/JSON mode); swappable |
| Auth | Email/password + JWT (MVP), AuthPort for future SSO | Simple, replaceable |
| Monorepo | npm workspaces | apps/web, apps/api, packages/* shared code |

## 3. Repository layout

```
brandflow/
  apps/
    api/            Fastify server, Prisma schema, ports, adapters, jobs
    web/            React app, embedded editor, dashboards
  packages/
    design-schema/  InternalDesignDocument types, Zod schemas, validation engine
    layout-recipes/ Layout recipe definitions + variety checker
    shared/         Shared domain types, workflow statuses, role constants
  docs/             This documentation set
```

## 4. Multi-tenancy model

- **Hierarchy:** `Organisation (tenant)` → `ClientCompany` → `BrandProfile` → content entities.
- Every tenant-owned row carries `organisationId` **and** `clientCompanyId` (denormalised for defence in depth).
- **Request scoping:** auth middleware resolves `{ userId, organisationId, memberships[] }`; a `tenantContext` (activeClientCompanyId) is required on all content routes and verified against memberships before any handler runs.
- **Repository guard:** all Prisma access goes through tenant-scoped repository helpers that inject `where: { clientCompanyId }`; raw `prisma.*` access in route handlers is lint-banned.
- **Hardening (post-MVP):** Postgres Row-Level Security keyed on a per-request `SET app.client_id`, as a second enforcement layer.
- **AI prompt isolation:** prompt assembly functions accept a `BrandContext` object built by a single `buildBrandContext(clientCompanyId, brandProfileId)` function — the only path from DB to prompt. It is unit-tested to reject mixed-tenant inputs, and every generated prompt is stamped with the tenant id in the audit log.

## 5. Ports (vendor flexibility)

All external dependencies sit behind TypeScript interfaces in `apps/api/src/ports/`:

- **AiProviderPort** — `complete(step, input, schema)` returns schema-validated JSON for a named pipeline step. Adapters: Anthropic (MVP), mock (tests).
- **DesignEnginePort** — create/load/update/validate design document, render preview, export PNG/PDF, import/export project JSON, duplicate, apply brand tokens, apply layout recipe. Adapter: Polotno (converts InternalDesignDocument ⇄ Polotno scene JSON).
- **RendererPort** — server-side raster/PDF rendering (Polotno node render or headless Chromium fallback).
- **StoragePort** — put/get/delete/signedUrl. Adapters: S3, local-disk (dev).
- **AuthPort** — register, login, verify, session. Adapter: local JWT (MVP).
- **AssetProviderPort** — icon/asset lookup: internal library, licensed open icon sets, approved packs.

The **InternalDesignDocument** (see [09-design-generation-schema.md](09-design-generation-schema.md)) is the system of record stored in Postgres; Polotno scene JSON is derived, never authoritative. Switching editors means writing one new adapter.

## 6. AI pipeline (queue workers)

Ten discrete steps (see [08-ai-workflow-design.md](08-ai-workflow-design.md)), each a BullMQ job with typed input/output, Zod-validated structured JSON, retry with repair-prompt on validation failure (max 2), and audit events. No single mega-prompt.

## 7. Request lifecycle example — "Generate visual package"

1. `POST /api/clients/:clientId/post-packages/:id/visual` — middleware verifies membership + role capability (`content:generate`).
2. Handler enqueues `visual-generation` job; returns 202 + job id.
3. Worker: loads BrandContext → step 6 (visual concept) → recipe selection (variety-aware) → step 7 (structured design generation constrained by recipe slots) → step 8 (programmatic validation via `packages/design-schema`) → on failure, repair loop → persists InternalDesignDocument revision → renders preview via RendererPort → stores preview in object storage.
4. Frontend polls job status; on success loads the design into the Polotno editor via DesignEnginePort conversion.

## 8. Audit logging

Fastify `onSend` hook + explicit service-level events write `AuditEvent { userId, organisationId, clientCompanyId, entityType, entityId, action, before?, after?, at }`. Append-only table; no update/delete grants.

## 9. Background jobs

Queues: `ai-generation` (steps 1–7, 9, 10), `design-validation` (step 8 inline in worker), `render` (previews, exports), `export` (ZIP assembly). Concurrency limits per tenant to prevent noisy-neighbour cost blowout.

## 10. Security summary

- JWT with short expiry + refresh; passwords argon2id.
- Role/capability checks per route ([07-permission-model.md](07-permission-model.md)).
- Tenant scoping enforced in middleware + repository layer (+ RLS later).
- Uploaded files virus-scanned (ClamAV container) and content-type validated before storage.
- Signed URLs for all asset access; no public buckets.
- AI provider calls carry no cross-client data; per-asset `allowInPrompts` flag gates private content.
- Rate limiting per user and per tenant on generation endpoints.

## 11. Deployment (MVP)

Docker Compose: `web` (static via CDN/nginx), `api`, `worker`, `postgres`, `redis`, `minio`, `clamav`. Single-region. CI: lint → typecheck → unit → integration (testcontainers Postgres) → e2e (Playwright) → build images.
