import { useCallback, useEffect, useState } from 'react';
import { clientApi } from '../../lib/api';

interface CommentRow {
  id: string;
  body: string;
  elementId: string | null;
  resolved: boolean;
  createdAt: string;
  authorId: string;
}

export interface ReviewCommentsPanelProps {
  designDocumentId: string | null;
  selectedElementId: string | null;
  highlightedElementId: string | null;
  onHighlightElement: (elementId: string | null) => void;
  onSelectElement: (elementId: string) => void;
  className?: string;
}

/** Element-anchored review comments (Agent 12, P5-C). */
export function ReviewCommentsPanel({
  designDocumentId,
  selectedElementId,
  highlightedElementId,
  onHighlightElement,
  onSelectElement,
  className = '',
}: ReviewCommentsPanelProps) {
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!designDocumentId) {
      setRows([]);
      return;
    }
    try {
      const list = await clientApi<CommentRow[]>(
        `/comments?entityType=DESIGN_DOCUMENT&entityId=${encodeURIComponent(designDocumentId)}`,
      );
      setRows(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [designDocumentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (!designDocumentId || !body.trim()) return;
    setBusy(true);
    try {
      await clientApi('/comments', {
        method: 'POST',
        body: JSON.stringify({
          entityType: 'DESIGN_DOCUMENT',
          entityId: designDocumentId,
          body: body.trim(),
          elementId: selectedElementId ?? undefined,
        }),
      });
      setBody('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleResolved(id: string, resolved: boolean) {
    await clientApi(`/comments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ resolved }),
    });
    await load();
  }

  if (!designDocumentId) {
    return (
      <div className={`rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-400 ${className}`}>
        Review comments appear after a package-linked save.
      </div>
    );
  }

  const open = rows.filter((r) => !r.resolved);

  return (
    <div className={`rounded border border-amber-200 bg-amber-50/40 p-3 text-sm ${className}`}>
      <strong className="text-xs font-semibold uppercase tracking-wide text-amber-800">Review comments</strong>
      {open.length > 0 && (
        <span className="ml-2 text-xs text-amber-700">{open.length} open</span>
      )}
      <ul className="mt-2 max-h-40 space-y-1.5 overflow-auto text-xs">
        {rows.map((c) => (
          <li
            key={c.id}
            className={`rounded border px-2 py-1.5 ${
              c.resolved
                ? 'border-slate-200 bg-white/60 text-slate-400 line-through'
                : highlightedElementId === c.elementId
                  ? 'border-amber-500 bg-amber-100'
                  : 'border-amber-200 bg-white'
            }`}
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  if (c.elementId) {
                    onSelectElement(c.elementId);
                    onHighlightElement(c.elementId);
                  }
                }}
              >
                {c.elementId && (
                  <span className="mr-1 font-mono text-[10px] text-amber-700">@{c.elementId.slice(0, 8)}</span>
                )}
                {c.body}
              </button>
              <button
                type="button"
                className="shrink-0 text-[10px] text-slate-500 hover:text-slate-800"
                title={c.resolved ? 'Reopen' : 'Resolve'}
                onClick={() => toggleResolved(c.id, !c.resolved)}
              >
                {c.resolved ? '↩' : '✓'}
              </button>
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="text-slate-500">No comments yet.</li>}
      </ul>
      <textarea
        className="mt-2 w-full rounded border border-amber-200 bg-white px-2 py-1 text-xs"
        rows={2}
        placeholder={
          selectedElementId
            ? 'Comment on selected element…'
            : 'General comment (select an element to anchor)'
        }
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <button
        type="button"
        className="mt-1 w-full rounded bg-amber-600 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        disabled={busy || !body.trim()}
        onClick={submit}
      >
        Add comment
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
