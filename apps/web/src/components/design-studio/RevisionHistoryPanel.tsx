import { useCallback, useEffect, useState } from 'react';
import type { InternalDesignDocument } from '@brandflow/design-schema';
import { parseDesignDocument } from '@brandflow/design-schema';
import { exportPageSvg } from '@brandflow/exporters/svg';
import { clientApi } from '../../lib/api';

interface RevisionRow {
  id: string;
  version: number;
  reason: string;
  createdAt: string;
  pageCount: number;
  internalDoc?: unknown;
}

export interface RevisionHistoryPanelProps {
  designDocumentId: string | null;
  onReverted: (doc: InternalDesignDocument) => void;
  className?: string;
}

const REASON_LABELS: Record<string, string> = {
  AI_GENERATED: 'AI generated',
  AI_REGENERATED: 'AI regenerated',
  AI_PATCH: 'AI edit',
  HUMAN_EDIT: 'Manual save',
  EXTERNAL_IMPORT: 'External import',
  REVERT: 'Reverted',
};

/** Design revision list with revert (Agent 12, P5-B). */
export function RevisionHistoryPanel({
  designDocumentId,
  onReverted,
  className = '',
}: RevisionHistoryPanelProps) {
  const [rows, setRows] = useState<RevisionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    if (!designDocumentId) {
      setRows([]);
      return;
    }
    try {
      const list = await clientApi<RevisionRow[]>(`/design-documents/${designDocumentId}/revisions`);
      setRows(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [designDocumentId]);

  useEffect(() => {
    load();
  }, [load]);

  function thumbFor(row: RevisionRow) {
    if (thumbs[row.version]) return thumbs[row.version];
    if (!row.internalDoc) return '';
    try {
      const svg = exportPageSvg(parseDesignDocument(row.internalDoc), 0);
      setThumbs((t) => ({ ...t, [row.version]: svg }));
      return svg;
    } catch {
      return '';
    }
  }

  async function revert(version: number) {
    if (!designDocumentId) return;
    if (!confirm(`Revert to version ${version}? Current work will be saved as a new revision.`)) return;
    setBusy(true);
    try {
      await clientApi(`/design-documents/${designDocumentId}/revert`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      });
      const row = await clientApi<{ internalDoc: unknown }>(`/design-documents/${designDocumentId}`);
      onReverted(parseDesignDocument(row.internalDoc));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!designDocumentId) {
    return (
      <div className={`rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-400 ${className}`}>
        Revision history appears after a package-linked save.
      </div>
    );
  }

  return (
    <div className={`rounded border border-slate-200 p-3 text-sm ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <strong className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revision history</strong>
        <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={load}>
          Refresh
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <ul className="mt-2 max-h-48 space-y-2 overflow-auto text-xs">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-2 rounded border border-slate-100 bg-slate-50 p-2">
            <button
              type="button"
              className="h-10 w-14 shrink-0 overflow-hidden rounded border border-slate-200 bg-white [&_svg]:h-full [&_svg]:w-full"
              title="Preview"
              onMouseEnter={() => thumbFor(r)}
              dangerouslySetInnerHTML={{ __html: thumbs[r.version] ?? '' }}
            />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-800">
                v{r.version} · {REASON_LABELS[r.reason] ?? r.reason}
              </div>
              <div className="text-slate-500">
                {new Date(r.createdAt).toLocaleString()} · {r.pageCount} page{r.pageCount !== 1 ? 's' : ''}
              </div>
              {r.reason !== 'REVERT' && rows[0]?.version !== r.version && (
                <button
                  type="button"
                  className="mt-1 text-indigo-600 hover:underline disabled:opacity-50"
                  disabled={busy}
                  onClick={() => revert(r.version)}
                >
                  Revert to this
                </button>
              )}
            </div>
          </li>
        ))}
        {rows.length === 0 && !error && <li className="text-slate-400">No revisions yet.</li>}
      </ul>
    </div>
  );
}
