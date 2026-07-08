/**
 * AI-directed scoped edits (Design Studio "Edit with AI").
 *
 * The AI returns a small list of PatchOperations (never a whole new document);
 * `applyDesignPatch` applies them to a copy of the document under three
 * guarantees — locked elements untouched, out-of-scope edits refused, result
 * re-parsed through the schema. This service adds the same violation-guided
 * repair loop the freeform composer uses (max 2 attempts) and re-imposes
 * locked elements from the base as defence-in-depth (docs/08 §4, docs/17 §6).
 *
 * Nothing here persists — the route owns the transaction. Pure enough to unit
 * test with a stub AiProviderPort.
 */
import type {
  InternalDesignDocument,
  RejectedOp,
  ValidationReport,
} from '@brandflow/design-schema';
import {
  AiPatchOutput,
  applyDesignPatch,
  DesignPatch,
  patchTouchedPageIds,
  reimposeLocked,
  validateDesignDocument,
} from '@brandflow/design-schema';
import type { AiProviderPort } from '../ports/index.js';

export type PatchScope = 'element' | 'page' | 'document';

export interface PatchRequest {
  instruction: string;
  scope: PatchScope;
  /** Element ids (element scope) or page ids (page scope). */
  targetIds: string[];
  /** Ids locked for this edit, in addition to the doc's own locked elements. */
  lockedElementIds: string[];
  /** Brand context (from buildBrandContext) shown to the model. */
  brand: unknown;
}

export interface PatchServiceResult {
  document: InternalDesignDocument;
  report: ValidationReport;
  patch: DesignPatch;
  rejected: RejectedOp[];
  reimposedLockedIds: string[];
  rationale: string;
  needsAttention: boolean;
  attempts: number;
}

export interface PatchOptions {
  bannedPhrases?: string[];
  contrastMode?: 'enforce' | 'warn';
  /** Recipe slots that must remain present (hybrid/recipe docs). */
  requiredSlotIds?: string[];
  newId?: () => string;
}

/**
 * Build a compact excerpt of just the elements/pages the edit is scoped to,
 * so the prompt stays small and the model can't reference off-scope ids.
 */
export function buildExcerpt(doc: InternalDesignDocument, scope: PatchScope, targetIds: string[]) {
  const touched = new Set(patchTouchedPageIds(doc, { scope, targetIds } as DesignPatch));
  const wantElement = scope === 'element' ? new Set(targetIds) : null;
  const summarise = (el: InternalDesignDocument['pages'][number]['elements'][number]): unknown => ({
    id: el.id,
    type: el.type,
    name: el.name,
    locked: el.locked,
    zIndex: el.zIndex,
    roleHint: el.roleHint,
    frame: el.frame,
    ...(el.type === 'text'
      ? { text: el.text, fontFamily: el.fontFamily, fontSize: el.fontSize, fontWeight: el.fontWeight, colour: el.colour }
      : {}),
    ...(el.type === 'shape' ? { shape: el.shape, fill: el.fill } : {}),
    ...(el.type === 'icon' ? { iconRef: el.iconRef, colour: el.colour } : {}),
    ...(el.type === 'image' ? { src: el.src, assetId: el.assetId, isPlaceholder: el.isPlaceholder } : {}),
    ...(el.type === 'group' ? { children: el.children.map(summarise) } : {}),
  });
  return {
    canvas: doc.canvas,
    brandTokens: { colours: Object.keys(doc.brandTokens.colours), fonts: doc.brandTokens.fonts },
    pages: doc.pages
      .filter((p) => touched.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        background: p.background,
        elements: (wantElement ? p.elements.filter((e) => wantElement.has(e.id)) : p.elements).map(summarise),
      })),
  };
}

/**
 * Run the AI scoped-edit with up to `maxAttempts` (default 2) violation-guided
 * repair rounds. Returns the best result — passing if any attempt validated,
 * otherwise the fewest-errors attempt flagged `needsAttention`. Returns null
 * only if no attempt produced a structurally-applicable patch.
 */
export async function patchDesign(
  ai: AiProviderPort,
  base: InternalDesignDocument,
  request: PatchRequest,
  opts: PatchOptions = {},
): Promise<PatchServiceResult | null> {
  const maxAttempts = 2;
  const excerpt = buildExcerpt(base, request.scope, request.targetIds);
  let violations: string[] = [];
  let best: PatchServiceResult | null = null;
  let attemptsMade = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attemptsMade++;
    try {
      const { data } = await ai.complete(
        'design_patch',
        {
          instruction: request.instruction,
          scope: request.scope,
          targetIds: request.targetIds,
          lockedElementIds: request.lockedElementIds,
          excerpt,
          brand: request.brand,
          ...(attempt > 0 ? { violations } : {}),
        },
        AiPatchOutput,
      );

      // The trusted server owns scope/targets/locks — the AI only proposes ops.
      // Parse so the value is exactly the DesignPatch output type (defaults applied).
      const patch = DesignPatch.parse({
        patchVersion: 1,
        scope: request.scope,
        targetIds: request.targetIds,
        operations: data.operations,
        lockedElementIds: request.lockedElementIds,
        rationale: data.rationale,
      });

      const applied = applyDesignPatch(base, patch, { newId: opts.newId });
      // Defence-in-depth: overwrite any locked element from the base.
      const { document, reimposed } = reimposeLocked(base, applied.document, request.lockedElementIds);

      const report = validateDesignDocument(document, {
        bannedPhrases: opts.bannedPhrases,
        contrastMode: opts.contrastMode ?? 'enforce',
        requiredSlotIds: opts.requiredSlotIds,
      });

      const result: PatchServiceResult = {
        document,
        report,
        patch,
        rejected: applied.rejected,
        reimposedLockedIds: reimposed,
        rationale: patch.rationale,
        needsAttention: !report.passed,
        attempts: attempt + 1,
      };

      if (report.passed && applied.applied > 0) return result;

      // Feed both rule errors and rejected ops back for the repair round.
      violations = [
        ...report.errors.map((e) => e.message),
        ...applied.rejected.map((r) => `Operation ${r.index} (${r.op}) was rejected: ${r.reason}${r.detail ? ` (${r.detail})` : ''}`),
      ];
      if (applied.applied === 0 && !violations.length)
        violations = ['No operations applied — check element ids and scope.'];

      // keep the closest attempt (fewest residual errors)
      if (!best || report.errors.length < best.report.errors.length) best = result;
    } catch (err) {
      violations = [String(err)];
    }
  }
  if (best) best.attempts = attemptsMade; // report total attempts, not the best attempt's index
  return best;
}
