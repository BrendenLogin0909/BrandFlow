import { useMemo, useState } from 'react';
import type { InternalDesignDocument, RejectedOp, ValidationReport } from '@brandflow/design-schema';
import { parseDesignDocument, walkElements, type LockableElement } from '@brandflow/design-schema';
import { clientApi } from '../../lib/api';
import { derivePatchScope } from './patchScope';
import { summarizePatchDiff } from './patchDiffSummary';

export const AI_EDIT_PRESETS = [
  { id: 'simplify', label: 'Simplify', instruction: 'Simplify the layout: fewer decorative elements, cleaner hierarchy, same message.' },
  { id: 'contrast', label: 'More contrast', instruction: 'Increase contrast for better readability on LinkedIn feeds.' },
  { id: 'two-tone', label: 'Two-tone headline', instruction: 'Make the headline two-tone using brand primary and text colours.' },
  { id: 'whitespace', label: 'More whitespace', instruction: 'Add more whitespace and breathing room without removing key content.' },
] as const;

interface PatchApiResponse {
  version: number;
  validationReport: ValidationReport;
  needsAttention: boolean;
  rationale: string;
  rejected: RejectedOp[];
  reimposedLockedIds: string[];
  attempts: number;
  provider: string;
}

interface DesignDocumentRow {
  id: string;
  internalDoc: unknown;
  version: number;
}

export interface AiEditPanelProps {
  document: InternalDesignDocument;
  activePageId: string | null;
  selectedIds: string[];
  /** Authoritative DesignDocument id — required for server patch. */
  designDocumentId: string | null;
  contrastMode: 'enforce' | 'warn';
  onApply: (doc: InternalDesignDocument) => void;
  className?: string;
}

function collectLockedIds(doc: InternalDesignDocument): string[] {
  const ids: string[] = [];
  for (const page of doc.pages) {
    for (const el of walkElements(page.elements as LockableElement[])) {
      if (el.locked) ids.push(el.id);
    }
  }
  return ids;
}

/**
 * Selection-aware "Edit with AI" panel — calls POST /design-documents/:id/patch,
 * shows a diff summary, then Accept/Reject before updating local canvas state.
 */
export function AiEditPanel({
  document: doc,
  activePageId,
  selectedIds,
  designDocumentId,
  contrastMode,
  onApply,
  className = '',
}: AiEditPanelProps) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewBase, setPreviewBase] = useState<InternalDesignDocument | null>(null);
  const [previewNext, setPreviewNext] = useState<InternalDesignDocument | null>(null);
  const [previewMeta, setPreviewMeta] = useState<PatchApiResponse | null>(null);

  const scopeInfo = useMemo(
    () => derivePatchScope(selectedIds, activePageId),
    [selectedIds, activePageId],
  );
  const lockedCount = useMemo(() => collectLockedIds(doc).length, [doc]);
  const diffLines = useMemo(
    () => (previewBase && previewNext ? summarizePatchDiff(previewBase, previewNext) : []),
    [previewBase, previewNext],
  );

  async function syncDocumentToServer(id: string, payload: InternalDesignDocument) {
    await clientApi(`/design-documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async function fetchDocument(id: string): Promise<InternalDesignDocument> {
    const row = await clientApi<DesignDocumentRow>(`/design-documents/${id}`);
    return parseDesignDocument(row.internalDoc);
  }

  async function runPatch() {
    if (!designDocumentId) {
      setError('Save your design first (linked to a post package) to enable AI edits.');
      return;
    }
    const trimmed = instruction.trim();
    if (!trimmed) {
      setError('Describe what you want the AI to change.');
      return;
    }

    setBusy(true);
    setError(null);
    setPreviewBase(null);
    setPreviewNext(null);
    setPreviewMeta(null);

    const baseSnapshot = doc;
    try {
      // Sync local canvas state to the authoritative document before patching.
      await syncDocumentToServer(designDocumentId, baseSnapshot);

      const lockedElementIds = collectLockedIds(baseSnapshot);
      const patchRes = await clientApi<PatchApiResponse>(`/design-documents/${designDocumentId}/patch`, {
        method: 'POST',
        body: JSON.stringify({
          instruction: trimmed,
          scope: scopeInfo.scope,
          targetIds: scopeInfo.targetIds,
          lockedElementIds,
          contrastMode,
        }),
      });

      const nextDoc = await fetchDocument(designDocumentId);
      setPreviewBase(baseSnapshot);
      setPreviewNext(nextDoc);
      setPreviewMeta(patchRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function acceptPreview() {
    if (!previewNext) return;
    onApply(previewNext);
    setPreviewBase(null);
    setPreviewNext(null);
    setPreviewMeta(null);
    setInstruction('');
    setError(null);
  }

  async function rejectPreview() {
    if (!designDocumentId || !previewBase) {
      setPreviewBase(null);
      setPreviewNext(null);
      setPreviewMeta(null);
      return;
    }
    setBusy(true);
    try {
      await syncDocumentToServer(designDocumentId, previewBase);
      setPreviewBase(null);
      setPreviewNext(null);
      setPreviewMeta(null);
      setError(null);
    } catch (e) {
      setError(`Could not revert: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className={`rounded border border-purple-200 bg-purple-50/40 p-3 ${className}`}>
      <legend className="px-1 text-xs font-semibold uppercase text-purple-700">Edit with AI</legend>

      {!designDocumentId && (
        <p className="mb-2 text-xs text-purple-800">
          Save your design while linked to a post package — that creates the authoritative document AI edits run against.
        </p>
      )}

      <p className="mb-2 text-xs text-slate-600">
        Scope: <strong>{scopeInfo.label}</strong>
        {lockedCount > 0 && (
          <span className="ml-1 text-purple-700">· {lockedCount} locked (always protected)</span>
        )}
      </p>

      <div className="mb-2 flex flex-wrap gap-1">
        {AI_EDIT_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="rounded-full border border-purple-300 bg-white px-2 py-0.5 text-[11px] font-medium text-purple-800 hover:bg-purple-100 disabled:opacity-50"
            disabled={busy || Boolean(previewNext)}
            onClick={() => setInstruction(p.instruction)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <textarea
        className="mb-2 w-full rounded border border-purple-200 bg-white px-2 py-1.5 text-sm"
        rows={3}
        placeholder="e.g. Make the headline bolder and move the CTA to the bottom-right"
        value={instruction}
        disabled={busy || Boolean(previewNext)}
        onChange={(e) => setInstruction(e.target.value)}
      />

      {!previewNext ? (
        <button
          type="button"
          className="w-full rounded-md bg-purple-600 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
          disabled={busy || !designDocumentId}
          onClick={runPatch}
        >
          {busy ? 'AI is editing…' : '✨ Apply AI edit'}
        </button>
      ) : (
        <div className="space-y-2 rounded border border-purple-300 bg-white p-2 text-sm">
          {previewMeta?.rationale && (
            <p className="text-xs text-slate-600">
              <strong className="text-purple-800">AI:</strong> {previewMeta.rationale}
            </p>
          )}
          {previewMeta?.needsAttention && (
            <p className="text-xs font-medium text-amber-700">
              Validation issues remain — review before approving the post.
            </p>
          )}
          {previewMeta?.rejected?.length ? (
            <p className="text-xs text-amber-600">
              {previewMeta.rejected.length} operation(s) skipped (locked or out of scope).
            </p>
          ) : null}
          <ul className="max-h-32 space-y-0.5 overflow-auto text-xs text-slate-700">
            {diffLines.map((line, i) => (
              <li key={`${line.kind}-${line.elementId ?? i}`}>• {line.label}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-md bg-purple-600 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
              disabled={busy}
              onClick={acceptPreview}
            >
              Accept
            </button>
            <button
              type="button"
              className="flex-1 rounded-md border border-slate-300 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
              disabled={busy}
              onClick={rejectPreview}
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </fieldset>
  );
}
