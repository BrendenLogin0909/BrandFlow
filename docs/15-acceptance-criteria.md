# BrandFlow — MVP Acceptance Criteria

**Version:** 1.0 · **Date:** 2026-07-04
Each criterion is testable; verification method in brackets. **All must pass for MVP acceptance.**

---

## A. Tenancy, auth, roles

- **A1.** A user can register, create an organisation, log in, and see only organisations/clients they are assigned to. [E2E]
- **A2.** For every client-scoped endpoint, a user without membership in that client receives 404 and no data; verified across the full route × role matrix. [Integration matrix]
- **A3.** An agency user assigned to two clients can switch between them; every list/view shows only the active client's data. [E2E]
- **A4.** Role capabilities match the permission table exactly (spot-checked: Designer cannot approve; Reviewer cannot edit design; Read-only cannot export). [Integration]
- **A5.** A canary string planted in client B's brand data never appears in any prompt, generation, or API response for client A. [Automated canary test]

## B. Brand profiles & Gate 1

- **B1.** A brand profile can be drafted by AI from questionnaire + uploaded files (PDF, logos, example posts) and website URL. [E2E with fixtures]
- **B2.** Every AI-drafted field is human-editable before approval. [E2E]
- **B3.** Generation endpoints refuse (409) for a brand profile not in APPROVED status. [Integration]
- **B4.** Approval creates an ApprovalRecord and audit event; post-approval edits require re-approval of changed sections. [Integration]

## C. Content plan & Gate 2

- **C1.** AI generates a content calendar (slots with date/objective/pillar/format) that is editable and requires approval before batch package generation. [E2E]
- **C2.** Batch generation refuses for an unapproved calendar. [Integration]

## D. Post packages & Gate 3

- **D1.** A generated post package contains every required field: internal title, audience, objective, ≥3 hooks, main text, shorter + longer versions, CTA, hashtags, first comment, suggested visual format, carousel outline (when applicable), on-image text, slide texts (carousel), alt text, compliance notes, quality score. [Contract test]
- **D2.** Part-level regeneration works for each of: hook, CTA, main text, hashtags, first comment, single carousel slide, on-image headline — and touches nothing else. [Integration per part]
- **D3.** Locked fields survive any regeneration byte-identically. [Integration]
- **D4.** Workflow transitions follow Idea → Drafting → Generated → In review → Needs changes → Approved → Exported → Archived; illegal transitions 409; every transition audited. [State-machine test]
- **D5.** Export is blocked until Gate 3 approval. [Integration]
- **D6.** Comments work at post level and design-element level (anchored to element id, shown on canvas). [E2E]

## E. Visual packages — the core differentiator

- **E1.** Every generated visual is delivered as an InternalDesignDocument of layered editable elements (text, icon, shape, image, group) — **never** a single raster. A document whose pages contain only one full-canvas image fails validation. [Schema + validation test]
- **E2.** In the embedded editor a user can: move, resize, rotate, reorder/re-layer, group/ungroup, recolour, replace image/icon, change font (within kit), edit text, delete elements, add new elements, edit background — and saved changes persist and re-validate. [E2E covering each verb]
- **E3.** AI output is schema-validated before rendering; invalid output triggers repair then fallback; the user never sees an invalid design. [Integration with malformed fixtures]
- **E4.** Validation enforces: brand palette only (unless permitted override), approved fonts, logo rules, safe margins, LinkedIn dimensions, slide-count bounds, min font sizes, ≥4.5:1 text contrast, no text overflow, no missing required recipe elements, approved assets only, no unsupported element types, no hidden/covered content. [Rule-by-rule unit tests]
- **E5.** Element locking: locked elements are immutable in the editor and API, and survive visual regeneration; part-level visual regeneration (concept, layout, icons, background, colours, single slide) touches only the requested part. [Integration]
- **E6.** ≥3 single-image recipes and ≥3 carousel recipes ship, each with ≥2 variants. [Inventory check]
- **E7.** Adapter round-trip preserves ids, locks, geometry (±0.5px), text, token refs, z-order across Internal ⇄ Polotno conversion. [Contract test]

## F. Brand family variety test ⭐ (critical acceptance test)

- **F1.** Generating a batch of 5 visuals for one brand yields 5 documents with pairwise-distinct `(recipeId, variantId)` layouts. Repeated 20× with different seeds — always passes. [Automated]
- **F2.** The same 5 visuals share brand tokens: identical palette, font set, logo treatment, icon style. [Automated token audit]
- **F3.** A human review board confirms the batch "looks like one brand family, no two identical layouts" on all 3 fixture brands. [Manual sign-off]

## G. Asset library

- **G1.** Upload logo/photo/icon/illustration/document/previous-post; tag; approve/unapprove; filter by type, tag, campaign, brand, approval status. [E2E]
- **G2.** Unapproved assets never appear in generated designs or asset suggestions. [Integration]
- **G3.** Assets default `allowInPrompts=false` and their extracted content stays out of prompts unless enabled. [Prompt snapshot test]
- **G4.** Usage counts increment on export. [Integration]

## H. Export

- **H1.** For an approved package: copy text to clipboard; export PNG and JPEG; carousel → single PDF and per-slide PNGs; editable design JSON; package ZIP containing all of the above; calendar → CSV. Each creates an ExportRecord. [E2E]
- **H2.** Exported PNG/PDF visually matches the editor preview (perceptual diff within threshold). [Snapshot]
- **H3.** Exported design JSON re-imports into an editable document equal to the original. [Round-trip]

## I. Audit & revisions

- **I1.** Every status change, approval, generation, edit-save, export, and permission-relevant action writes an AuditEvent with user, action, timestamp, entity, tenant. [Integration sweep]
- **I2.** Post text and design documents have revision histories; a design can be reverted to a prior revision (as a new revision). [E2E]

## J. Non-functional

- **J1.** 10-slide carousel opens in the editor in < 3s (mid-tier laptop, broadband). [Perf test]
- **J2.** Single post package generation (steps 5–8 + preview) completes in < 90s p95. [Perf test]
- **J3.** No severity-1 security findings open (upload fuzzing, authz matrix, dependency audit clean). [Security checklist]
- **J4.** MVP performs no LinkedIn publishing of any kind. [Code inventory]
