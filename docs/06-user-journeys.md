# BrandFlow — User Journeys

**Version:** 1.0 · **Date:** 2026-07-04

---

## Journey 1 — Agency onboards a new client and brand (Gate 1)

**Actor:** Agency Admin, then Brand Manager, then Client Admin (approver)

1. Agency Admin creates a Client Company ("Acme Robotics") and assigns team members with roles (strategist, designer, reviewer) and invites the client's marketing lead as Client Admin.
2. Brand Manager opens Acme's workspace via the **client switcher** (all data now scoped to Acme) and creates a Brand Profile.
3. Onboarding wizard: enters website URL and LinkedIn page, uploads brand-guidelines PDF, logos, six previous posts, one pitch deck; answers the questionnaire (tone sliders, audiences, do/don't rules).
4. Clicks **Analyse** → AI pipeline (steps 1–2) drafts the full brand system: extracted palette, detected fonts, tone descriptors, pillars, audiences, phrase lists, layout preferences. Progress shown; ~1–2 min.
5. Brand Manager reviews every section, corrects the accent colour, deletes a hallucinated pillar, adds two banned phrases, marks two logos approved.
6. Submits for approval → Client Admin gets notified, reviews, clicks **Approve brand** (Gate 1). ApprovalRecord + audit event written.
7. Brand profile status = APPROVED; generation features unlock for this brand.

**Success:** brand usable for generation only after explicit human approval; every AI-drafted field was editable.

## Journey 2 — Content plan for the month (Gate 2)

**Actor:** Content Strategist, Approver

1. Strategist selects Acme → approved brand profile → **Generate content plan** with inputs: 3 posts/week for August, focus pillar "automation ROI", one event promo mid-month.
2. AI drafts a calendar: dated slots each with objective, pillar, suggested format (mix of single images, carousels, quote cards).
3. Strategist drags slots around, swaps two formats, deletes one slot, adds a hiring post.
4. Submits → Approver reviews the plan and approves (Gate 2). Batch generation is now allowed for these slots.

## Journey 3 — Single post package end-to-end (Gate 3) — the core loop

**Actor:** Content Strategist → Designer → Reviewer → Approver

1. Strategist opens a calendar slot (objective: educational carousel) and pastes source material (a case-study PDF excerpt marked `allowInPrompts`).
2. **Ideas:** AI suggests 5 angles; strategist edits one ("5 hidden costs of manual QA") and approves it.
3. **Generate package:** AI produces hooks (3 options), main text, short/long variants, CTA, hashtags, first comment, carousel outline, slide-by-slide on-image text, alt text, compliance notes, quality score. Status → GENERATED.
4. Strategist tweaks the hook, locks `mainText`, regenerates only hashtags (locked fields untouched).
5. **Generate visual:** AI picks the *numbered-list carousel* recipe (variety check confirms the last 4 Acme visuals used different recipes), emits an InternalDesignDocument; validation passes (contrast, margins, text fits); previews render.
6. **Designer** opens the embedded editor: swaps slide 3's icon, nudges the headline up, replaces the background tint with an approved secondary colour (palette picker shows only brand colours), locks the logo element. Saves → server re-validates → new DesignRevision.
7. Designer regenerates **slide 5 only** — layout of other slides and all locked elements preserved.
8. Status → IN_REVIEW. **Reviewer** comments on slide 2's subheading (element-anchored comment) → NEEDS_CHANGES → strategist edits the text → back IN_REVIEW.
9. **Approver** approves (Gate 3). Status → APPROVED.
10. **Export:** copy post text, download carousel PDF + slide PNGs + design JSON as ZIP. Status → EXPORTED; ExportRecords + audit events written. User posts to LinkedIn manually.

## Journey 4 — Designer deep-edits a generated visual

1. Designer opens an APPROVED-pending design; canvas shows layered elements with a layers panel.
2. Moves the statistic number, resizes the supporting caption, reorders a badge above the photo, ungroups the icon cluster, deletes one icon, adds a new line divider, changes heading font weight (only brand fonts listed), replaces the image placeholder with an approved library photo.
3. Attempts to pick an off-palette red → editor palette restricts to brand colours (override requires `brand:manage` and is flagged in the validation report).
4. Saves; server validation flags "body text 13px < 14px minimum" → inline warning on the element; designer bumps to 15px; save passes.

## Journey 5 — Reviewer requests changes

1. Reviewer opens the review queue (all IN_REVIEW packages for their assigned clients).
2. Side-by-side: post text + visual preview + validation report + brand compliance notes.
3. Adds a post-level comment ("hook 2 is stronger") and an element-level comment on the CTA badge; clicks **Request changes** → NEEDS_CHANGES; strategist notified.

## Journey 6 — Agency user switches clients safely

1. User assigned to Acme and Borealis (competitors) switches from Acme to Borealis.
2. Every list, calendar, asset grid, and editor now shows only Borealis data; deep-linking an Acme URL returns 404 (not 403 — existence not revealed).
3. A generation run for Borealis is audited with Borealis's tenant id; prompt assembly used only Borealis's BrandContext. No Acme phrase, colour, or example can appear.

## Journey 7 — Asset library upkeep

1. Brand Manager uploads 20 event photos, tags them `event-2026`, approves 15.
2. Generating an event promo: AI asset suggestions list only approved items; unapproved photos never appear in generated designs.
3. Usage counts increment on export; a photo marked unapproved later is flagged in any design that still references it.
