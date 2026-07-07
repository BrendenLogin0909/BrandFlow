# BrandFlow

**AI-powered LinkedIn content creation and branding platform.**

BrandFlow generates complete LinkedIn content packages — post text **plus matching, fully editable, layered visual designs** — inside a governed workflow of human review, approval, and export. It is a multi-tenant SaaS for agencies, consultants, and in-house teams.

The core differentiator: **AI never produces static images.** Every visual is a structured `InternalDesignDocument` of editable elements (text, icons, shapes, logos, groups, layers) that a human can adjust element-by-element in an embedded Canva-style editor (Polotno SDK), validated against brand rules before it is ever shown.

## 👉 Current status & AI handoff

- **[docs/00-project-status.md](docs/00-project-status.md)** — living status: what's built vs stubbed, gotchas, next steps (read first).
- **[CLAUDE.md](CLAUDE.md)** — orientation for AI agents.
- **[docs/16-backlog.md](docs/16-backlog.md)** — parked work.

## Documentation (design & spec)

| # | Document |
|---|---|
| 1 | [Product requirements](docs/01-product-requirements.md) |
| 2 | [Technical architecture](docs/02-technical-architecture.md) |
| 3 | [Design engine comparison & recommendation](docs/03-design-engine-comparison.md) |
| 4 | [Data model](docs/04-data-model.md) |
| 5 | [API routes](docs/05-api-routes.md) |
| 6 | [User journeys](docs/06-user-journeys.md) |
| 7 | [Permission model](docs/07-permission-model.md) |
| 8 | [AI workflow design](docs/08-ai-workflow-design.md) |
| 9 | [Design generation schema](docs/09-design-generation-schema.md) |
| 10 | [Layout recipe system](docs/10-layout-recipe-system.md) |
| 11 | [Validation rules](docs/11-validation-rules.md) |
| 12 | [MVP implementation plan](docs/12-mvp-implementation-plan.md) |
| 13 | [Testing strategy](docs/13-testing-strategy.md) |
| 14 | [Risks & mitigations](docs/14-risks-and-mitigations.md) |
| 15 | [Acceptance criteria](docs/15-acceptance-criteria.md) |

## Repository layout

```
apps/
  api/            Fastify + Prisma API — ports, adapters, tenant guard, routes
  web/            React + Vite + Tailwind — dashboard, client switcher, embedded editor
packages/
  design-schema/  InternalDesignDocument (Zod) + validation engine + text measurement
  layout-recipes/ Recipe framework, 6 recipes (3 single + 3 carousel), variety guard
  exporters/      Licence-free editable exports: layered SVG + native PPTX
  shared/         Roles/capabilities, workflow state machine, LinkedIn presets
docs/             Full documentation set (see table above)
examples/         Generated sample exports — open the .pptx in PowerPoint/Google
                  Slides or the .svg in Figma/Inkscape to see editable AI output
```

## Key design decisions

- **Editable-by-design:** the internal design schema is the authoritative stored format; Polotno scene JSON is a derived cache behind `DesignEnginePort`, so the editor vendor is swappable.
- **No licence required for editable output:** `packages/exporters` converts any design to layered SVG (editable in Figma/Inkscape/Penpot) and native PPTX (editable in PowerPoint/Google Slides/LibreOffice). The embedded Polotno editor runs on its free 60-day dev trial (watermarked, staging-only); the commercial editor decision is deferred — see the licensing update in [docs/03](docs/03-design-engine-comparison.md).
- **Recipes over freeform generation:** the AI fills recipe *slots* (text, icons, treatments); deterministic code owns geometry. Invalid or off-brand designs are structurally hard to produce, and the **brand family variety guard** mechanically guarantees that batches share a brand look without repeating layouts.
- **Three human approval gates:** brand profile → content plan → each post/design package.
- **Tenant isolation everywhere:** membership-verified routing (404, never 403, across tenants), tenant-scoped repositories, and a single audited `buildBrandContext` choke point so one client's data can never enter another client's AI prompts.
- **Ten discrete AI steps** with Zod-validated structured JSON output and a bounded repair loop — never one giant prompt, never unvalidated visual output.

## Getting started (dev)

```bash
# infra (Postgres exposed on host port 5433 — 5432 often has a native install)
docker compose up -d postgres redis

# install & database
npm install
cp apps/api/.env.example apps/api/.env   # fill in ANTHROPIC_API_KEY etc.
npx --workspace apps/api prisma migrate dev

# run
npm run dev:api                # Fastify on :3001
npm run dev:web                # Vite on :5173 (proxies /api)

# tests (includes the brand-family variety acceptance test)
npm test
```

**Try it with zero setup:** `npm install && npm run dev:web`, then open
<http://localhost:5173/playground> — the **Recipe Playground** runs the whole
design engine (recipes, brand tokens, validation, layered SVG preview and
download) entirely in the browser, with no database, AI key, or design-SDK
licence.

## Status

Scaffold stage. The documentation set is complete; the design schema, validation engine, layout recipes, variety guard, permission model, Prisma data model, tenant middleware, and representative API routes are implemented; remaining route modules, queue workers, and editor wiring follow the [MVP implementation plan](docs/12-mvp-implementation-plan.md).

MVP explicitly excludes LinkedIn auto-publishing — export only.
