# BrandFlow — Product Requirements Document (PRD)

**Version:** 1.0 · **Status:** Draft for approval · **Date:** 2026-07-04

---

## 1. Product summary

BrandFlow is an AI-assisted LinkedIn content production platform for agencies, consultants, and in-house marketing teams. It generates **complete content packages** — LinkedIn-ready post text plus matching, **fully editable, layered visual designs** — inside a governed workflow of human review, refinement, approval, and export.

BrandFlow is **not** an AI writing tool and **not** an AI image generator. Its core differentiator: every AI-generated visual is a structured, layered design document (text boxes, icons, logos, shapes, backgrounds, groups, layers) that a human can open in an embedded Canva-style editor and change element-by-element. The AI never delivers a flat raster image as the primary output.

## 2. Problem statement

Teams producing branded LinkedIn content today face three failure modes:

1. **Generic AI tools** produce off-brand text and static images that cannot be corrected without starting over.
2. **Design tools** (Canva, Figma) require manual design work for every post and provide no brand-governed AI generation pipeline.
3. **Agencies** managing many clients have no tenant-isolated system that keeps each client's brand kit, assets, calendar, and approvals separate — a serious risk when serving competing clients.

BrandFlow closes the gap: AI drafts at scale, humans stay in control, brands stay consistent, and every visual remains editable to the last element.

## 3. Target users and usage models

| Usage model | Description |
|---|---|
| Agency | A content agency managing multiple client companies, each with isolated data |
| Single company | One company managing its own brand profile(s) |
| Multi-user company | A company with multiple users and differentiated roles |
| Multi-brand company | One company with sub-brands, product lines, or executive personal brands |
| Consultant/freelancer | An individual managing content for several clients |

### Personas

- **Agency admin** — manages clients, users, billing relationship; needs hard tenant separation.
- **Content strategist** — plans pillars, calendars, briefs the AI, curates ideas.
- **Designer** — refines generated visuals in the embedded editor.
- **Reviewer/Approver** — reviews packages, leaves comments, approves or requests changes.
- **Client admin / stakeholder** — sees only their own company's workspace; approves brand and content.

## 4. Core value proposition

1. **Editable-by-design visuals.** AI generates structured scene JSON validated against brand rules, rendered into an embedded editor where every element is movable, resizable, recolourable, replaceable, and deletable.
2. **Brand governance.** A human-approved brand profile (colours, fonts, voice, rules) constrains every generation step.
3. **Human-in-the-loop workflow.** Three approval gates: brand approval → content plan approval → post/design approval.
4. **Agency-grade multi-tenancy.** Strict data isolation per client; AI prompts never mix clients' data.
5. **Vendor flexibility.** Internal design schema decoupled from the editor SDK; AI provider behind a port.

## 5. Functional requirements

### 5.1 Accounts, tenancy, roles

- Multi-organisation platform; an organisation (tenant) contains client companies (an in-house company is simply an organisation with one client company: itself).
- Users belong to an organisation and are assigned to specific client companies with roles.
- Roles (MVP): Platform Owner, Agency Admin, Client Admin, Brand Manager, Content Strategist, Designer, Reviewer, Approver, Read-only Stakeholder.
- Client switcher: agency users switch between assigned clients; all views are scoped to the active client.
- No cross-client data visibility, ever. See [07-permission-model.md](07-permission-model.md).

### 5.2 Brand profiles (Gate 1)

- Each client company can have one or more brand profiles (main brand, sub-brand, product, executive).
- Brand profile contents: name, logos, colours, fonts, typography rules, icon/photography/illustration styles, design density, tone of voice, writing examples, visual examples, target audiences, content pillars, do/don't rules, approved/banned phrases, compliance rules, CTA styles, hashtag preferences, layout preferences, example posts/carousels, competitor/inspiration references.
- **AI-assisted onboarding:** user provides website URL, LinkedIn examples, PDFs, brand guidelines, logos, previous posts, brochures, case studies, pitch decks, example visuals, and/or questionnaire answers. AI analyses inputs and drafts the brand system.
- **Gate 1:** the drafted brand profile is unusable for generation until a human with the Approver capability reviews, edits, and approves it. Every field is editable pre- and post-approval (post-approval edits create a new revision requiring re-approval of changed sections).

### 5.3 Content strategy and calendar (Gate 2)

- AI generates a content strategy (pillars, cadence, mix of objectives/formats) from the approved brand profile plus user input.
- Content calendar with planned slots (date, objective, pillar, format, status).
- **Gate 2:** the plan/calendar must be approved before batch generation of post packages.

### 5.4 Post package generation (Gate 3)

Workflow: select client → select brand profile → choose objective (thought leadership, announcement, event promo, case study, educational, hiring, founder insight, project update, industry commentary) → optional source material → AI suggests ideas → user approves/edits idea → AI generates full package → AI generates visual concept → AI composes editable design document → user edits text and design → user approves → export.

A **post package** contains: internal title, target audience, objective, hook options, main post text, shorter alternative, longer alternative, suggested CTA, hashtags, first comment, suggested visual format, carousel outline (if applicable), on-image text, slide-by-slide text, alt text, brand compliance notes, confidence/quality score, revision history.

### 5.5 Visual packages

- Formats: single image, carousel, quote card, statistic card, founder insight card, event promo, case-study graphic, problem/solution, before/after, mini-framework diagram, checklist carousel, educational carousel, announcement graphic.
- Generation uses **layout recipes** (see [10-layout-recipe-system.md](10-layout-recipe-system.md)) — a controlled library producing on-brand variety, never one fixed template.
- AI outputs an **InternalDesignDocument** (structured JSON) that is validated before rendering ([11-validation-rules.md](11-validation-rules.md)). The AI can never return arbitrary/unvalidated visual output.
- The document is converted to the design engine's native format (Polotno scene JSON) and opened in the embedded editor.
- **Brand family variety test:** any batch of ≥5 visuals for one brand must look like one brand family with no two using the exact same layout (see [15-acceptance-criteria.md](15-acceptance-criteria.md)).

### 5.6 Embedded editor

Human reviewers must be able to: move, resize, rotate, reorder, layer, group/ungroup, recolour, replace images/icons, change fonts, edit text, delete elements, add new elements (text, shape, icon, image, line), change backgrounds, and manage pages/slides.

**Locking:** users can lock brand colours, logo placement, specific text, specific slides, specific elements, and entire approved sections. Locked items survive regeneration.

### 5.7 Part-level regeneration

Regenerable in isolation: hook, CTA, main post text, hashtags, first comment, a single carousel slide, on-image headline, visual concept, layout, icon selection, background style, colour treatment, entire post package, entire visual package. Regeneration must preserve locked/approved parts.

### 5.8 Asset library

Per client and brand profile: upload logos, photos, icons, illustrations, documents, previous posts; manual tagging; approved/unapproved flag; usage count; filters by type, tag, campaign, brand, client, approval status; asset suggestions per post from metadata; unapproved assets are never used in generation; private customer content never enters prompts unless explicitly allowed per asset.

**Icon self-sufficiency:** built-in licensed open icon libraries (e.g. Lucide/Tabler, ISC/MIT), user-approved icon packs, controlled generated simple SVG icons, and an internal icon library mapped to brand styles. AI selects icons/metaphors/layouts from content, and all selections remain editable.

### 5.9 Workflow, comments, audit

- Statuses: Idea → Drafting → Generated → In review → Needs changes → Approved → Exported → Archived.
- Every status change writes an audit event (user, action, timestamp, entity, tenant).
- Comments at post level and design-element level (element-anchored comments).
- Full revision history on post packages and design documents.

### 5.10 Export (MVP — no auto-publish)

Copy text to clipboard · export image PNG/JPEG · carousel PDF · carousel slides as PNGs · editable design JSON/project file · calendar CSV · full package ZIP. Every export writes an ExportRecord.

## 6. Non-functional requirements

- **Tenant isolation:** every query scoped by tenant; AI prompts assembled only from the active client's data; automated cross-tenant leakage tests.
- **Auditability:** immutable audit log of all state changes.
- **Performance:** editor loads a 10-slide carousel < 3s on broadband; single-post generation pipeline < 90s end-to-end.
- **Portability:** internal design schema is the system of record; editor SDK and AI provider replaceable behind ports.
- **Cost:** design engine licensing must not require per-end-customer subscriptions (see [03-design-engine-comparison.md](03-design-engine-comparison.md)).
- **Accessibility:** generated alt text on every visual; editor keyboard operability tracked as fast-follow.

## 7. Out of scope (MVP) / Roadmap

LinkedIn scheduling & publishing, analytics, A/B variants, client approval portal, billing, campaign planning, richer collaboration, more formats, Instagram/X/Facebook, video/reels, advanced compliance review, template marketplace, white-label.

## 8. MVP scope checklist

1. Authentication and user roles
2. Organisation/client management
3. Brand profile creation
4. AI-assisted brand profile draft from questionnaire + uploads
5. Human approval for brand profile (Gate 1)
6. Content idea and LinkedIn post generation
7. Editable visual generation via structured design schema
8. Embedded editor for human adjustment
9. Asset library
10. Approval workflow (Gates 2 and 3, statuses, comments)
11. Export: clipboard / PNG / PDF / design JSON
12. Audit log
13. Multi-tenant separation
14. ≥3 layout recipes for single-image posts
15. ≥3 layout recipes for carousels
16. Brand family variety test passing

## 9. Success metrics (MVP)

- ≥80% of generated packages approved with ≤2 revision rounds.
- 100% of generated visuals pass automated validation before display.
- 0 cross-tenant data incidents (verified by automated tests).
- Median time from idea approval to exported package < 15 minutes including human editing.
- Brand family variety test passes on every 5-visual batch in acceptance testing.
