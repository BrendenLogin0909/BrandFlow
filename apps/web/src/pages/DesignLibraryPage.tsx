/**
 * Design library — every saved draft, rendered as live SVG thumbnails from
 * the stored InternalDesignDocument (no raster previews, no licence).
 * Reviewers open a draft back into the playground; nothing is ever lost on
 * export.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InternalDesignDocument } from '@brandflow/design-schema';
import { exportPageSvg } from '@brandflow/exporters/svg';
import { exportPptxBlob } from '@brandflow/exporters/pptx';
import { clientApi } from '../lib/api';

interface Draft {
  id: string;
  name: string;
  internalDoc: InternalDesignDocument;
  playgroundSource: unknown | null;
  updatedAt: string;
}

function Thumb({ doc }: { doc: InternalDesignDocument }) {
  const svg = useMemo(() => {
    try {
      return exportPageSvg(doc, 0);
    } catch {
      return null;
    }
  }, [doc]);
  if (!svg) return <div className="flex h-40 items-center justify-center text-xs text-slate-400">preview unavailable</div>;
  return (
    <div
      className="overflow-hidden rounded-t-xl [&_svg]:h-auto [&_svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function DesignLibraryPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['design-drafts'],
    queryFn: () => clientApi<Draft[]>('/design-drafts'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => clientApi(`/design-drafts/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['design-drafts'] }),
  });

  async function downloadPptx(draft: Draft) {
    const blob = await exportPptxBlob(draft.internalDoc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${draft.name.replace(/[^\w-]+/g, '-')}.pptx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Design library</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every saved design, kept as an editable document — reopen, review, or export any time.
          </p>
        </div>
        <Link to="/playground" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
          New design
        </Link>
      </div>

      {isLoading && <div className="mt-10 text-slate-500">Loading…</div>}
      {error != null && (
        <div className="mt-10 text-sm text-red-600">
          Could not load drafts — select a client in the sidebar and make sure you are signed in.
        </div>
      )}
      {data?.length === 0 && (
        <div className="mt-10 rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
          No saved designs yet — create one in the playground and click <strong>Save draft</strong>.
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-5 lg:grid-cols-4">
        {(data ?? []).map((draft) => (
          <div key={draft.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <Thumb doc={draft.internalDoc} />
            <div className="border-t border-slate-100 p-3">
              <div className="truncate text-sm font-semibold">{draft.name}</div>
              <div className="text-xs text-slate-400">
                {draft.internalDoc.pages.length} page{draft.internalDoc.pages.length > 1 ? 's' : ''} ·{' '}
                {new Date(draft.updatedAt).toLocaleDateString()}
              </div>
              <div className="mt-2 flex gap-1.5 text-xs">
                <Link
                  to={`/playground?draft=${draft.id}`}
                  className="flex-1 rounded border border-slate-300 py-1 text-center hover:bg-slate-50"
                >
                  Open
                </Link>
                <button
                  className="flex-1 rounded border border-slate-300 py-1 hover:bg-slate-50"
                  onClick={() => downloadPptx(draft)}
                  title="Editable PowerPoint — imports into Canva, Google Slides, PowerPoint"
                >
                  PPTX
                </button>
                <button
                  className="rounded border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50"
                  onClick={() => {
                    if (confirm(`Delete draft "${draft.name}"?`)) remove.mutate(draft.id);
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
