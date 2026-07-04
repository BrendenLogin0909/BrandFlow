# BrandFlow — AI Workflow Design

**Version:** 1.0 · **Date:** 2026-07-04

---

## 1. Principles

1. **Separate steps, not one giant prompt.** Ten discrete pipeline steps, each with typed input, a Zod output schema, its own prompt template, and its own audit/cost record (GenerationJob).
2. **Structured JSON everywhere.** Every step returns JSON validated against its schema (via tool-use / JSON mode). Free-text is never parsed with regex.
3. **The AI never emits final pixels.** Step 7 emits an InternalDesignDocument; rendering is deterministic application code. Optional AI imagery (background textures/illustrations) is a *suggested asset*, inserted as an editable ImageElement, never a flattened design.
4. **Validate-then-repair.** Schema or design-rule failures trigger a repair prompt containing the specific violations; max 2 repairs, then fall back to deterministic recipe defaults and flag for human attention.
5. **Tenant isolation.** Every prompt is assembled exclusively from one `BrandContext`; the context builder is the single choke point and is tenant-tested.
6. **Locks are hard constraints.** Locked fields/elements are passed as immutable context ("do not change these; output them verbatim") *and* re-imposed programmatically after generation — belt and braces.

## 2. Pipeline steps

| # | Step | Input | Output (Zod schema) | Trigger |
|---|---|---|---|---|
| 1 | **Brand analysis** | Uploaded docs (extracted text), website/LinkedIn scrape text, questionnaire | `BrandAnalysis`: detected palette, fonts, tone signals, themes, audience clues, phrase candidates | Brand onboarding |
| 2 | **Brand profile drafting** | BrandAnalysis + questionnaire | `BrandProfileDraft`: full profile fields (kit, style guide, voice, pillars, audiences) each with `confidence` + `sourceRef` | After step 1 |
| 3 | **Content strategy generation** | Approved BrandContext + user goals (cadence, focus, events) | `ContentPlan`: dated slots {objective, pillar, format, rationale} | Gate 1 passed |
| 4 | **Post idea generation** | BrandContext + objective + optional source material | `PostIdeas[5]`: {title, angle, audience, format suggestion, score} | User request |
| 5 | **Post copy generation** | BrandContext + approved idea + source material | `PostPackageDraft`: hooks[3], mainText, shortVersion, longVersion, cta, hashtags, firstComment, suggestedVisualFormat, carouselOutline?, onImageText, slideTexts?, altText, complianceNotes, qualityScore | Idea approved |
| 6 | **Visual concept generation** | BrandContext + post package + allowed formats | `VisualConcept`: format, metaphor, iconIdeas[], imageIdeas[], colourTreatment, layoutHints, recipe candidates ranked | After step 5 |
| 7 | **Structured design generation** | BrandContext + concept + **selected recipe contract** (slots, limits, brand tokens) + approved asset metadata + licensed icon search results | `RecipeFill`: per-slot content {text, iconRef, assetRef, tokenRefs} — *not* freeform geometry | Recipe selected |
| 8 | **Design validation** | Assembled InternalDesignDocument | Programmatic (no LLM): validation report | Always before display |
| 9 | **Brand compliance review** | Final copy + on-image text + style guide | `ComplianceReport`: banned-phrase hits, tone deviations, rule violations, severity | Before IN_REVIEW |
| 10 | **Accessibility review** | Design doc + copy | `AccessibilityReport`: alt-text quality, contrast advisories, reading-order notes | Before IN_REVIEW |

**Key design decision — step 7 fills recipes, it does not invent geometry.** The recipe defines canvas size, safe areas, element hierarchy, positioning logic and layering ([10-layout-recipe-system.md](10-layout-recipe-system.md)). The AI fills *slots* (headline text, list items, icon choices, colour-token picks within allowed ranges). Application code assembles the InternalDesignDocument from recipe + fill. This makes step 8 rarely fail, keeps designs on-brand, and prevents the model from inventing unsupported element types. Variation comes from recipe choice, slot options, token treatments, and optional elements — not from unconstrained layout.

## 3. Recipe selection & the variety guard

Before step 7, the application (not the LLM) selects the recipe: filter recipes by format + slot compatibility with the content → rank by step 6's candidate ranking → **variety guard** drops any recipe used in the brand's last N (default 6) visuals unless no alternative fits → tie-break random. This mechanically guarantees the brand-family-variety acceptance test.

## 4. Part-level regeneration

Each regenerable part maps to a step + a scoped prompt:

| Part | Step | Scope |
|---|---|---|
| hook / cta / mainText / hashtags / firstComment | 5 (scoped variant) | Only that field in output schema; other fields passed as locked context |
| carousel slide N text | 5 | Single slide schema |
| visual concept | 6 | Full concept |
| layout | recipe re-selection + 7 | New recipe, same content, locked elements re-imposed |
| icon selection / background style / colour treatment | 7 (scoped) | Only those slots |
| slide N design | 7 (scoped) | Single page; other pages untouched |
| whole package / whole visual | 5→7 | Full rerun, locked parts preserved |

After any regeneration: locked elements are byte-compared against pre-regen state; any drift is overwritten from the lock store and logged.

## 5. Prompt template structure (every step)

```
System: role + hard rules (JSON only, banned behaviours, tenant-neutral)
BrandContext block: kit tokens, voice, pillars, audiences, do/don't,
                    approved/banned phrases, examples (this client only)
Task block: step instructions + few-shot examples
Constraints block: locked content (verbatim), length limits from recipe,
                   compliance rules
Output: JSON schema (tool definition)
```

Templates are versioned files in `apps/api/src/ai/prompts/`; the GenerationJob records `{ step, promptVersion, model, tokensUsed }` for observability, cost tracking, and regression testing.

## 6. Model & provider strategy

- Behind `AiProviderPort.complete(step, input, zodSchema)`. MVP adapter: Anthropic Claude (Sonnet-class for steps 4–7, cheaper model for 9–10 acceptable).
- Mock adapter with recorded fixtures for tests and offline dev.
- Per-tenant rate limits and monthly token budgets; jobs record cost.
- Provider switch = one new adapter; schemas and prompts are provider-neutral (no provider-specific formatting in templates).

## 7. Failure handling

| Failure | Handling |
|---|---|
| Invalid JSON / schema fail | Repair prompt with violation list, max 2 retries, then job FAILED with human-readable reason |
| Design validation fail (step 8) | Violations fed back to step 7 repair; then deterministic fallback fill; flag `needsAttention` |
| Banned phrase in output | Auto-redact + note in compliance report; never silently shipped |
| Provider outage | Job retried with backoff; user sees queued state, never a broken package |
| Token budget exceeded | Job rejected upfront with clear message to org admin |
