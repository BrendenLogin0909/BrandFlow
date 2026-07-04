# BrandFlow — Testing Strategy

**Version:** 1.0 · **Date:** 2026-07-04

---

## 1. Test pyramid & tooling

| Level | Tooling | Scope |
|---|---|---|
| Unit | Vitest | Schemas, validation rules, recipe layout functions, permission maps, prompt builders |
| Property-based | fast-check | Layout/validation invariants under random content |
| Integration | Vitest + Testcontainers (Postgres, Redis, MinIO) | API routes, tenant scoping, workflow transitions, queue workers with mock AI |
| Contract | Vitest fixtures | AiProviderPort step schemas; Polotno adapter round-trip |
| E2E | Playwright | Journeys 1–7 against Docker Compose stack with mock AI adapter |
| Manual/exploratory | Checklist per release | Editor feel, visual quality review |

CI order: lint → typecheck → unit+property → integration → e2e → acceptance suite. AI-provider live tests run nightly, not per-commit (cost).

## 2. What gets tested hardest (risk-ranked)

### 2.1 Tenant isolation (zero-tolerance)

- **Matrix tests:** for every client-scoped route × every role, a user with membership in client A calls with client B's ids → expect 404, and DB query logs show no B-scoped rows returned.
- **Prompt isolation:** unit tests on `buildBrandContext` — attempts to pass mixed-tenant asset/profile ids throw; snapshot tests assert assembled prompts contain only fixture-client identifiers; a canary string planted in client B's brand data must never appear in client A's prompt or output.
- **Repository guard:** lint rule test that raw `prisma.` access outside repositories fails CI.

### 2.2 Design schema & validation engine

- Unit tests per rule (each rule: passing fixture, failing fixture, auto-fix fixture, override fixture).
- **Property-based:** random RecipeFill within slot constraints → assembled document must always pass structure+geometry validation (this is the core promise: recipes can't produce invalid designs). Random text lengths at the limits → no `text-overflow` after auto-fix.
- Contrast rule tested against WCAG reference pairs.
- Adapter round-trip: `fromPolotno(toPolotno(doc))` deep-equals on ids, locks, geometry (±0.5px), text, tokens, z-order — run over the full fixture corpus.

### 2.3 AI pipeline (with mock + recorded fixtures)

- Every step: valid fixture output → parses; malformed fixture → repair loop invoked → capped retries → graceful FAILED.
- Locked-field preservation: regenerate each part with locks set → locked bytes unchanged (programmatic re-imposition tested separately from prompt compliance).
- Banned-phrase injection: fixture output containing banned phrases → redaction + compliance report entry.
- Nightly live-provider smoke: one run per step against real Claude with a test brand; asserts schema validity and latency budget, records token cost trend.

### 2.4 Brand family variety test (acceptance-critical)

- Automated: generate 5 visuals for one fixture brand via the full pipeline (mock AI for determinism, seeded variants) → `checkBatchVariety` asserts pairwise-distinct `(recipeId, variantId)` and shared token usage. Repeated 20× with different seeds.
- Live version of the same test runs in the nightly suite with the real provider.
- Human check at release: side-by-side board of the 5 outputs reviewed against "same family, no identical layout".

### 2.5 Workflow & approvals

- State machine tests: every legal transition succeeds + audits; every illegal transition 409s.
- Gate enforcement: generation endpoints refuse for unapproved brand (Gate 1) / unapproved calendar batch (Gate 2); export refuses non-APPROVED packages (Gate 3).
- Separation-of-duties: last editor cannot approve when org setting on.

### 2.6 Editor (E2E)

- Load generated carousel → move/resize/recolour/replace icon/edit text/delete/add element → save → server re-validation → reload → changes persisted.
- Locking: locked element immovable in UI; API rejects mutation of locked element from a forged payload.
- Palette restriction: colour picker offers only brand tokens for a designer role.
- Regenerate slide N → other slides byte-identical.

## 3. Fixtures

- 3 fixture brands: light minimal, dark bold, high-contrast accessibility-stressing.
- Recorded AI outputs per step per brand (golden files) — regenerated deliberately when prompts change, diff-reviewed.
- Design document corpus: one per recipe × variant × brand (≥48 docs) used by validation, adapter, and render tests.
- Render snapshot tests: preview PNGs compared with perceptual diff (threshold-tolerant) to catch layout regressions.

## 4. Non-functional testing

- **Performance:** k6 on generation endpoints (queue depth under 50 concurrent jobs); editor load budget test (10-slide doc < 3s TTI on mid-tier laptop, Playwright trace).
- **Security:** dependency audit in CI; upload fuzzing (mime spoofing, zip bombs, SVG script injection — SVGs sanitised); authz fuzz via the tenant matrix; secrets scanning.
- **Cost regression:** nightly job asserts per-package token cost within budget envelope; alert on +25%.

## 5. Release gate

A release ships only when: all CI suites green, acceptance criteria checklist ([15-acceptance-criteria.md](15-acceptance-criteria.md)) verified, variety board human-reviewed, and no open severity-1 bugs.
