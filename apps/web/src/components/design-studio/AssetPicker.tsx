import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientApi } from '../../lib/api';
import type { AssetKind, AssetLibraryItem, AssetPick, AssetSearchResult } from './assetTypes';
import { pickFromLibrary, pickFromSearch } from './assetTypes';

export type AssetPickerMode = 'image' | 'icon';

export interface AssetPickerProps {
  open: boolean;
  mode: AssetPickerMode;
  title: string;
  onClose: () => void;
  onPick: (pick: AssetPick) => void;
}

const TIER_HINT: Record<number, string> = {
  1: 'Tier 1 — auto-safe',
  2: 'Tier 2 — keep metadata',
  3: 'Tier 3 — review before use',
};

export function AssetPicker({ open, mode, title, onClose, onPick }: AssetPickerProps) {
  const [tab, setTab] = useState<'search' | 'library'>('search');
  const [kind, setKind] = useState<AssetKind>(mode === 'icon' ? 'icon' : 'photo');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AssetSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const { data: library } = useQuery({
    queryKey: ['assets'],
    queryFn: () => clientApi<AssetLibraryItem[]>('/assets'),
    enabled: open,
  });

  if (!open) return null;

  async function search() {
    setSearching(true);
    try {
      const k = mode === 'icon' ? 'icon' : kind;
      const res = await clientApi<{ results: AssetSearchResult[] }>(
        `/assets/search?kind=${k}&q=${encodeURIComponent(q)}&limit=20`,
      );
      setResults(res.results);
    } finally {
      setSearching(false);
    }
  }

  const libraryItems = (library ?? []).filter((item) => {
    if (mode === 'icon') return item.type === 'ICON';
    return item.type === 'PHOTO' || item.type === 'ILLUSTRATION';
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold">{title}</h2>
          <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="flex gap-1 border-b border-slate-100 px-4 py-2">
          {(['search', 'library'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`rounded px-3 py-1 text-xs font-medium capitalize ${
                tab === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {tab === 'search' && (
            <div className="space-y-3">
              {mode === 'image' && (
                <div className="flex flex-wrap gap-1">
                  {(['photo', 'illustration', 'ai'] as AssetKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`rounded px-2 py-1 text-xs ${
                        kind === k ? 'bg-indigo-100 text-indigo-800' : 'border border-slate-200'
                      }`}
                      onClick={() => setKind(k)}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder={mode === 'icon' ? 'Search icons…' : 'Search assets…'}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && search()}
                />
                <button
                  type="button"
                  className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  disabled={searching}
                  onClick={search}
                >
                  {searching ? '…' : 'Search'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {results.map((r) => (
                  <AssetThumb
                    key={`${r.provider}-${r.providerId}`}
                    thumb={r.thumbUrl || r.contentUrl}
                    label={r.label}
                    sub={TIER_HINT[r.usageTier] ?? ''}
                    onClick={() => {
                      onPick(pickFromSearch(r));
                      onClose();
                    }}
                  />
                ))}
              </div>
              {!results.length && !searching && (
                <p className="text-xs text-slate-400">Search licence-aware providers (tier 1–3).</p>
              )}
            </div>
          )}

          {tab === 'library' && (
            <div className="grid grid-cols-2 gap-2">
              {libraryItems.map((item) => {
                const pick = pickFromLibrary(item);
                if (!pick) return null;
                return (
                  <AssetThumb
                    key={item.id}
                    thumb={item.thumbUrl || item.contentUrl || ''}
                    label={item.filename}
                    sub={item.approved ? (TIER_HINT[item.usageTier] ?? '') : 'Not approved'}
                    dimmed={!item.approved && item.usageTier > 1}
                    onClick={() => {
                      if (!item.approved && item.usageTier > 1) return;
                      onPick(pick);
                      onClose();
                    }}
                  />
                );
              })}
              {!libraryItems.length && (
                <p className="col-span-2 text-xs text-slate-400">No saved library items yet.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AssetThumb({
  thumb,
  label,
  sub,
  dimmed,
  onClick,
}: {
  thumb: string;
  label: string;
  sub: string;
  dimmed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rounded border border-slate-200 p-2 text-left hover:border-indigo-400 ${
        dimmed ? 'opacity-50' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex h-20 items-center justify-center overflow-hidden rounded bg-slate-50">
        {thumb.endsWith('.svg') || thumb.includes('svg') ? (
          <img src={thumb} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="mt-1 truncate text-xs font-medium">{label}</div>
      <div className="truncate text-[10px] text-slate-400">{sub}</div>
    </button>
  );
}
