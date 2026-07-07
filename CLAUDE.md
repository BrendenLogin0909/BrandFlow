# CLAUDE.md — read this first

You are working on **BrandFlow**, an AI-powered LinkedIn content + branding
SaaS. This file orients any AI agent; it is intentionally short and points
to the real documentation.

## Start here, in order
1. **[docs/00-project-status.md](docs/00-project-status.md)** — current state, what's built vs stubbed, gotchas, next steps. **Read this before doing anything.** Update it at the end of your session.
2. **[docs/16-backlog.md](docs/16-backlog.md)** — the parked-work list.
3. **[README.md](README.md)** — the design-doc index (docs/01–15: PRD, architecture, data model, AI workflow, layout recipes, validation, etc.).

## What this project is
Idea → AI-written copy → editable **layered** visual (recipes or AI freeform compose) → human review + approval gates → export to PPTX/SVG (Canva-editable). Multi-tenant, brand-governed, licence-aware free assets. NOT a ChatGPT wrapper and NOT a flat-image generator.

## Non-negotiable invariants (see status doc §6)
- `InternalDesignDocument` (packages/design-schema) is the authoritative format; PPTX/SVG/Polotno are derived.
- Everything visual passes `validateDesignDocument` — no invalid or off-brand output ships.
- Strict tenant isolation; AI prompts only via `buildBrandContext`; cross-tenant → 404.
- Assets only from the licence-aware whitelist (apps/api/src/assets/registry.ts), gated by usage tier.
- Editable layered output only (the `no-raster-only` rule).

## How to run (Windows dev)
`docker compose up -d postgres redis` (Postgres on host **5433**) → `npm run dev:api` (:3001) → `npm run dev:web` (:5173). Login `alex@acme.test` / `supersecret123`. `/playground` needs no backend. AI works offline via a mock adapter; real AI uses the key in `apps/api/.env` (never print it).

## Gotchas that will bite you (see status doc §7)
- After `prisma migrate`: stop API → `prisma generate` → restart (DLL lock).
- Clamp AI string outputs in Zod (`.transform`), never hard-reject on length.
- Icon paint attrs go on the wrapper `<svg>`, not stripped roots.
- Avoid double-quotes in git commit messages on this Windows/PowerShell setup.

## Working style the owner expects
Iterate in **loops** (generate → screenshot/critique → refine), verify things actually work end-to-end (use the Preview tools / curl against the running API), prefer free/no-subscription solutions, and be honest about what is stubbed. Visual-quality benchmark: the **29FORWARD Australia** LinkedIn page.

## When you finish
Update `docs/00-project-status.md`, commit, and push to `main`.
