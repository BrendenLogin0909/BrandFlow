# BrandFlow — Risks & Mitigations

**Version:** 1.0 · **Date:** 2026-07-04

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **Cross-tenant data leakage** (agencies with competing clients) | Low | Critical | Layered enforcement (middleware + scoped repositories + planned RLS); single audited prompt-assembly choke point; canary-string tests; 404-not-403 policy; append-only audit. Zero-tolerance test matrix in CI. |
| 2 | **AI design output quality is poor/ugly** despite validity | Medium | High | Recipes own geometry (AI fills slots only); deterministic layout code; text measurement with real fonts; human editor is a first-class step, not a fallback; golden-fixture visual snapshot reviews; recipe governance requires 3-brand fixture sign-off. |
| 3 | **Polotno vendor risk** (small vendor, licence change, EOL) | Medium | Medium | InternalDesignDocument is authoritative; Polotno JSON is derived cache; DesignEnginePort isolates it; IMG.LY adapter and custom-Konva escape paths costed in [03-design-engine-comparison.md](03-design-engine-comparison.md); pin versions; licence terms confirmed in writing pre-launch. |
| 4 | **LLM structured-output failures** (schema drift, hallucinated fields) | Medium | Medium | Tool-use/JSON mode + Zod parse + repair loop (max 2) + deterministic fallback fill + `needsAttention` flag; prompt versioning with golden-file regression tests; nightly live smoke tests. |
| 5 | **AI cost blowout** (agencies batch-generating) | Medium | Medium | Per-tenant rate limits + monthly token budgets; GenerationJob cost tracking; cheaper models for review steps; part-level regeneration avoids full reruns; nightly cost-regression alert. |
| 6 | **Text overflow / unreadable designs in unusual languages or long brand names** | High | Medium | Server-side text measurement; auto font step-down; property-based tests at limits; validation blocks export, never silently clips. |
| 7 | **Icon/font licensing exposure** | Low | High | MVP icon sets limited to ISC/MIT (Lucide, Tabler) with licence files vendored; fonts limited to OFL Google Fonts + customer-uploaded fonts (customer warrants rights, ToS clause); AssetProviderPort centralises provenance metadata. |
| 8 | **Uploaded brand material contains sensitive data that leaks into prompts** | Medium | High | `allowInPrompts=false` by default per asset; extraction pipeline strips before prompt assembly unless flagged; per-org data-processing terms; no training on customer data (provider DPA). |
| 9 | **Scope creep — editor becomes a Canva rebuild** | High | Medium | Hard MVP boundary: Polotno's stock capabilities + brand-constrained panels only; custom editor features require post-MVP RFC; de-scope levers pre-agreed ([12-mvp-implementation-plan.md](12-mvp-implementation-plan.md)). |
| 10 | **LinkedIn spec changes** (image sizes, carousel/document rules) | Low | Low | Dimension presets in one config module; validation reads presets; export formats already generic (PNG/PDF). |
| 11 | **Approval-gate friction slows users into bypassing the product** | Medium | Medium | Gates apply to *usage*, not exploration (drafts freely editable); one-click approve for solo users (same person may hold Approver); SoD optional per org. |
| 12 | **Server-side rendering fidelity drift** (preview ≠ editor ≠ export) | Medium | Medium | Single rendering engine (Polotno) client and server; perceptual-diff snapshot tests across the fixture corpus; fonts embedded/subset at export. |
| 13 | **Queue/back-pressure failures under batch load** | Low | Medium | BullMQ retries + DLQ; per-tenant concurrency caps; idempotent workers (job ids); user-visible job states — no silent loss. |
| 14 | **Regulatory/compliance content risk** (regulated clients: finance, health) | Medium | Medium | Per-brand compliance rules enforced in step 9 + banned-phrase validation; compliance notes surfaced at Gate 3; advanced compliance review on roadmap; ToS: customer owns final approval. |
| 15 | **Team unfamiliarity with canvas/typography engineering** | Medium | Medium | Phase 1 spike scheduled first on the critical path; fixture-driven development; budget for one revision of the recipe framework. |

## Top three watch items

1. **Risk 1 (isolation)** — engineering discipline, tested continuously, non-negotiable.
2. **Risk 2 (quality)** — the product lives or dies on whether outputs feel professionally designed; invest in recipe craft and typography early.
3. **Risk 3/12 (design-engine dependency)** — keep the internal schema pure; never let Polotno-specific concepts leak above the adapter.
