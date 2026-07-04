# BrandFlow — MVP Implementation Plan

**Version:** 1.0 · **Date:** 2026-07-04

Assumes a team of 2–4 engineers (1 frontend-lean, 1 backend-lean, 1 full-stack/AI) + design support. Timeline: ~14 weeks to MVP acceptance. Phases overlap; each phase ends with a demoable increment.

---

## Phase 0 — Foundations (wk 1–2)

- Monorepo (npm workspaces), CI (lint/typecheck/test), Docker Compose dev stack (Postgres, Redis, MinIO).
- Prisma schema v1 (full data model), migrations, seed script (demo agency, 2 clients, users per role).
- Auth (register/login/JWT/refresh, argon2id), membership middleware, tenant-scoped repositories, capability guard, audit interceptor.
- **Exit:** authenticated multi-tenant API skeleton; cross-tenant access tests red-team pass.

## Phase 1 — Design core (wk 2–5) ⚠ critical path, start immediately

- `packages/design-schema`: InternalDesignDocument Zod schemas, validation engine (structure, geometry, readability, brand rules), text measurement utility.
- `packages/layout-recipes`: recipe framework + 8 recipes (4 single, 4 carousel) with variants; variety guard; `checkBatchVariety`.
- Polotno spike → licence confirmation → `PolotnoAdapter` (Internal ⇄ scene JSON) with round-trip tests.
- Server-side rendering via `polotno-node` (preview PNG, PDF) behind RendererPort.
- **Exit:** hand-written fixture documents render, open in an embedded editor, edit, save, re-validate, export PNG/PDF.

## Phase 2 — Brand system & Gate 1 (wk 4–7)

- Brand profile CRUD (kit, style guide, voice, pillars, audiences); asset upload (StoragePort, ClamAV, signed URLs); asset library UI (filters, tagging, approval flags, allowInPrompts).
- AI steps 1–2 (brand analysis, profile drafting) with document text extraction (pdf, docx, html scrape) via queue.
- Onboarding wizard UI; brand review/edit screens; Gate 1 approval flow + ApprovalRecords.
- **Exit:** Journey 1 (agency onboards client brand) demoable end-to-end.

## Phase 3 — Content pipeline & Gates 2–3 (wk 6–10)

- AI steps 3–5 (strategy, ideas, post copy) + step 9–10 (compliance, accessibility) with Zod-validated structured output, repair loop, GenerationJob tracking.
- Content calendar UI + Gate 2; idea board; post package editor (all fields, alternatives, lock toggles, part-level regeneration for text parts).
- Workflow statuses + transitions, review queue, comments (post-level), Gate 3 for text.
- **Exit:** Journey 2 + text half of Journey 3 demoable.

## Phase 4 — Visual generation (wk 8–12) ⚠ the differentiator

- AI step 6 (visual concept) + step 7 (recipe slot fill); recipe selection with variety guard; assembly; step 8 validation + repair + fallback; preview rendering.
- Embedded editor page: brand-constrained panels (palette/fonts locked to kit), layers, locking UI, element-level comments, save → server re-validate → DesignRevision.
- Part-level visual regeneration (concept/layout/icons/background/colours/slide N) with lock preservation.
- Icon library integration (Lucide + Tabler, licence-vetted) via AssetProviderPort.
- **Exit:** full Journey 3 + Journey 4 demoable; brand family variety test passing on demo brands.

## Phase 5 — Export, audit surfacing, hardening (wk 11–14)

- Exports: clipboard, PNG/JPEG, carousel PDF, slide PNGs, design JSON, calendar CSV, package ZIP; ExportRecords + download UI.
- Audit log viewer; revision history UIs (text + design, revert).
- Security hardening: rate limits, token budgets, RLS pilot, penetration checklist; performance pass (editor load < 3s, pipeline < 90s).
- Full acceptance test run ([15-acceptance-criteria.md](15-acceptance-criteria.md)); bug triage; docs.
- **Exit:** MVP acceptance criteria all green.

## Milestone summary

| Wk | Milestone |
|---|---|
| 2 | Multi-tenant API + auth green |
| 5 | Editable design core round-trips (fixture → editor → export) |
| 7 | Gate 1 brand onboarding demo |
| 10 | Text pipeline + Gates 2–3 demo |
| 12 | Full visual generation demo + variety test |
| 14 | MVP acceptance complete |

## Build order rationale

The design core (Phase 1) is the highest-risk, highest-novelty component and blocks Phase 4, so it starts in week 2 in parallel with foundations. The AI text pipeline (Phase 3) is lower risk (well-trodden structured-output territory) and overlaps Phase 2. Everything else is standard SaaS plumbing.

## De-scope levers (if timeline slips)

1. Ship 3+3 recipes instead of 4+4 (still meets requirement).
2. Element-level comments → post-level only (element-level fast-follow).
3. Calendar CSV export → fast-follow.
4. Brand analysis from URL scrape → questionnaire + file upload only.
5. ChartElement → roadmap (stat card uses text + shapes).

Non-negotiable: editable layered output, validation engine, three gates, tenant isolation, variety test.
