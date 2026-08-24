import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../lib/api';
import type { AssetKind, AssetLibraryItem, AssetPick, AssetSearchResult } from './assetTypes';
import { pickFromLibrary, pickFromSearch } from './assetTypes';

export type AssetPickerMode = 'image' | 'icon';

export interface AssetPickerProps {
  open: boolean;
  mode: AssetPickerMode;
  title: string;
  onClose: () => void;
  /** `placeOnCanvas` true → caller places at a canvas coordinate; false → insert at centre now. */
  onPick: (pick: AssetPick, opts?: { placeOnCanvas?: boolean }) => void;
}

const TIER_HINT: Record<number, string> = {
  1: 'Tier 1 — auto-safe',
  2: 'Tier 2 — keep metadata',
  3: 'Tier 3 — review before use',
};

const AI_PROMPT_MIN = 20;

export function AssetPicker({ open, mode, title, onClose, onPick }: AssetPickerProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'search' | 'library'>('search');
  const [kind, setKind] = useState<AssetKind>(mode === 'icon' ? 'icon' : 'illustration');
  const [q, setQ] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [results, setResults] = useState<AssetSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const { data: library } = useQuery({
    queryKey: ['assets'],
    queryFn: () => clientApi<AssetLibraryItem[]>('/assets'),
    enabled: open,
  });

  const { data: catalog } = useQuery({
    queryKey: ['assets-catalog'],
    queryFn: () =>
      clientApi<{ pools: { id: string; label: string; approx: number | null }[] }>('/assets/catalog'),
    enabled: open,
  });

  const runSearch = useCallback(async () => {
    setSearching(true);
    setAiError(null);
    try {
      const k = mode === 'icon' ? 'icon' : kind;
      // AI tab lists previously saved generations only — never spends credits.
      const res = await clientApi<{ results: AssetSearchResult[] }>(
        `/assets/search?kind=${k}&q=${encodeURIComponent(q)}&limit=48`,
      );
      setResults(res.results);
    } finally {
      setSearching(false);
    }
  }, [mode, kind, q]);

  useEffect(() => {
    if (!open) return;
    setTab('search');
    void runSearch();
  }, [open, kind, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runGenerate() {
    const prompt = aiPrompt.trim();
    if (prompt.length < AI_PROMPT_MIN) {
      setAiError(`Add more detail (at least ${AI_PROMPT_MIN} characters): subject, style, mood, setting.`);
      return;
    }
    setGenerating(true);
    setAiError(null);
    try {
      const res = await clientApi<{ results: AssetSearchResult[]; saved: { id: string }[] }>(
        '/assets/generate',
        {
          method: 'POST',
          body: JSON.stringify({ prompt, count: 1, shared: true }),
        },
      );
      setResults(res.results);
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  if (!open) return null;

  const libraryItems = (library ?? []).filter((item) => {
    if (mode === 'icon') return item.type === 'ICON';
    return item.type === 'PHOTO' || item.type === 'ILLUSTRATION';
  });

  const flatCount = catalog?.pools?.find((p) => p.id === 'undraw')?.approx;

  function handlePick(pick: AssetPick, placeOnCanvas = false) {
    onPick(pick, { placeOnCanvas });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold">{title}</h2>
            <p className="text-[10px] text-slate-500">
              Click to add at centre · or “Place on canvas” then click the design
            </p>
          </div>
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
                  {(['illustration', 'photo', 'ai'] as AssetKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`rounded px-2 py-1 text-xs ${
                        kind === k ? 'bg-indigo-100 text-indigo-800' : 'border border-slate-200'
                      }`}
                      onClick={() => setKind(k)}
                    >
                      {k === 'illustration' ? 'illustrations' : k === 'ai' ? 'AI (saved)' : k}
                    </button>
                  ))}
                </div>
              )}

              {kind !== 'ai' && (
                <div className="flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                    placeholder={
                      mode === 'icon'
                        ? 'Search icons…'
                        : kind === 'illustration'
                          ? 'e.g. team, chart, manager…'
                          : 'Search assets…'
                    }
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  />
                  <button
                    type="button"
                    className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    disabled={searching}
                    onClick={() => void runSearch()}
                  >
                    {searching ? '…' : 'Search'}
                  </button>
                </div>
              )}

              {kind === 'ai' && (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900">Generate with AI (uses API credits)</p>
                  <p className="text-[10px] text-amber-800">
                    Opening this tab does <strong>not</strong> spend credits. It only shows images already
                    generated and saved. To create new ones, write a detailed prompt and click Generate
                    (1 image, auto-saved to your library).
                  </p>
                  <textarea
                    className="w-full rounded border border-amber-300 bg-white px-2 py-1.5 text-sm"
                    rows={3}
                    placeholder="e.g. Flat vector illustration of a QA engineer at a laptop finding a bug, soft purple accent, LinkedIn carousel style, no text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] ${
                        aiPrompt.trim().length < AI_PROMPT_MIN ? 'text-amber-700' : 'text-slate-500'
                      }`}
                    >
                      {aiPrompt.trim().length}/{AI_PROMPT_MIN}+ characters
                    </span>
                    <button
                      type="button"
                      className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                      disabled={generating || aiPrompt.trim().length < AI_PROMPT_MIN}
                      onClick={() => void runGenerate()}
                    >
                      {generating ? 'Generating…' : 'Generate 1 image'}
                    </button>
                  </div>
                  {aiError && <p className="text-xs text-red-600">{aiError}</p>}
                  <button
                    type="button"
                    className="text-[10px] text-indigo-700 underline"
                    onClick={() => void runSearch()}
                  >
                    Refresh saved AI images
                  </button>
                </div>
              )}

              {!results.length && !searching && !generating && (
                <p className="text-xs text-slate-400">
                  {kind === 'ai'
                    ? 'No saved AI images yet — write a detailed prompt above and Generate.'
                    : q.trim()
                      ? kind === 'illustration'
                        ? `No flat illustrations for “${q}”. Try team, growth, checklist — or photo / AI.`
                        : `No results for “${q}”.`
                      : `Browse ${flatCount ? `${flatCount}+ ` : ''}illustrations — type a keyword or press Search.`}
                </p>
              )}
              {results.length > 0 && (
                <p className="text-[10px] text-slate-400">{results.length} results — click to insert</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {results.map((r) => {
                  const pick = pickFromSearch(r);
                  return (
                    <AssetThumb
                      key={`${r.provider}-${r.providerId}`}
                      thumb={r.thumbUrl || r.contentUrl}
                      label={r.label}
                      sub={TIER_HINT[r.usageTier] ?? ''}
                      onClick={() => handlePick(pick)}
                      onPlace={() => handlePick(pick, true)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'library' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                Saved assets only. {flatCount ?? '300'}+ bundled illustrations are under{' '}
                <button type="button" className="text-indigo-600 underline" onClick={() => setTab('search')}>
                  Search
                </button>
                .
              </p>
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
                        handlePick(pick);
                      }}
                    />
                  );
                })}
              </div>
              {!libraryItems.length && (
                <p className="text-xs text-slate-400">No saved items — use Search first.</p>
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
  onPlace,
}: {
  thumb: string;
  label: string;
  sub: string;
  dimmed?: boolean;
  onClick: () => void;
  onPlace?: () => void;
}) {
  return (
    <div
      className={`rounded border border-slate-200 p-2 text-left hover:border-indigo-400 ${
        dimmed ? 'opacity-50' : ''
      }`}
    >
      <button type="button" className="w-full" onClick={onClick}>
        <div className="flex h-20 items-center justify-center overflow-hidden rounded bg-slate-50">
          <img src={thumb} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
        </div>
        <div className="mt-1 truncate text-xs font-medium">{label}</div>
        <div className="truncate text-[10px] text-slate-400">{sub}</div>
      </button>
      {onPlace && (
        <button
          type="button"
          className="mt-1 w-full rounded border border-slate-200 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
          onClick={(e) => {
            e.stopPropagation();
            onPlace();
          }}
        >
          Place on canvas…
        </button>
      )}
    </div>
  );
}
