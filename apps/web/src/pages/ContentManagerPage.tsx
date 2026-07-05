/**
 * Content manager — the ideation phase of the production flow, Buffer-style:
 *   1. Capture ideas (manual now; AI suggestions once the queue is live)
 *   2. Approve or reject them
 *   3. Send an approved idea to the Recipe Playground to design it
 * Placement onto dates happens in the Calendar (Gate 2); full AI post-copy
 * drafting is the Post Packages phase.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CONTENT_OBJECTIVES, type ContentObjective } from '@brandflow/shared';
import { clientApi } from '../lib/api';

interface Idea {
  id: string;
  title: string;
  angle: string | null;
  objective: string;
  status: 'SUGGESTED' | 'APPROVED' | 'REJECTED' | 'EDITED';
  createdAt: string;
}

interface Candidate {
  title: string;
  angle?: string;
  objective: ContentObjective;
  score?: number;
  checked: boolean;
}

const COLUMNS: { key: string; title: string; hint: string; statuses: Idea['status'][] }[] = [
  { key: 'ideas', title: 'Ideas', hint: 'Captured, not yet approved', statuses: ['SUGGESTED', 'EDITED'] },
  { key: 'approved', title: 'Approved', hint: 'Ready to draft & design', statuses: ['APPROVED'] },
  { key: 'rejected', title: 'Rejected', hint: 'Kept for reference', statuses: ['REJECTED'] },
];

const OBJECTIVE_LABELS: Record<string, string> = Object.fromEntries(
  CONTENT_OBJECTIVES.map((o) => [o, o.replaceAll('_', ' ')]),
);

export function ContentManagerPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [angle, setAngle] = useState('');
  const [objective, setObjective] = useState<ContentObjective>('educational');

  // AI suggestion modal
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTheme, setAiTheme] = useState('');
  const [aiCount, setAiCount] = useState(5);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  // multi-select in the Ideas column
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: ideas, error } = useQuery({
    queryKey: ['ideas'],
    queryFn: () => clientApi<Idea[]>('/ideas'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ideas'] });

  const create = useMutation({
    mutationFn: () =>
      clientApi('/ideas', {
        method: 'POST',
        body: JSON.stringify({ title, angle: angle || undefined, objective }),
      }),
    onSuccess: () => {
      setTitle('');
      setAngle('');
      invalidate();
    },
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Idea['status'] }) =>
      clientApi(`/ideas/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => clientApi(`/ideas/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  async function suggest() {
    setAiBusy(true);
    try {
      const res = await clientApi<{ ideas: Omit<Candidate, 'checked'>[]; provider: string }>(
        '/ideas/suggest-sync',
        { method: 'POST', body: JSON.stringify({ theme: aiTheme || undefined, count: aiCount }) },
      );
      setCandidates(res.ideas.map((i) => ({ ...i, checked: true })));
      setAiProvider(res.provider);
    } finally {
      setAiBusy(false);
    }
  }

  async function addSelectedCandidates() {
    const picked = candidates.filter((c) => c.checked).map(({ checked: _c, ...idea }) => idea);
    if (picked.length === 0) return;
    await clientApi('/ideas/bulk', { method: 'POST', body: JSON.stringify({ ideas: picked }) });
    setCandidates([]);
    setAiOpen(false);
    invalidate();
  }

  async function expandSelected() {
    if (selected.size === 0) return;
    await clientApi('/ideas/expand-sync', {
      method: 'POST',
      body: JSON.stringify({ ideaIds: [...selected] }),
    });
    setSelected(new Set());
    invalidate();
  }

  function bulkStatus(status: Idea['status']) {
    Promise.all(
      [...selected].map((id) =>
        clientApi(`/ideas/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
      ),
    ).then(() => {
      setSelected(new Set());
      invalidate();
    });
  }

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col p-8">
      <h1 className="text-2xl font-bold">Content manager</h1>
      <p className="mt-1 text-sm text-slate-500">
        Capture and curate next month's ideas, approve the keepers, then design each one in the
        playground. Scheduling onto dates happens in the Calendar.
      </p>

      {/* capture */}
      <form
        className="mt-5 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) create.mutate();
        }}
      >
        <label className="min-w-64 flex-1 text-sm">
          <span className="font-semibold">New idea</span>
          <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            placeholder="e.g. 5 hidden costs of manual QA"
            value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="min-w-64 flex-1 text-sm">
          <span className="font-semibold">Angle / notes</span>
          <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            placeholder="optional — the take, the audience, the source"
            value={angle} onChange={(e) => setAngle(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="font-semibold">Objective</span>
          <select className="mt-1 block rounded border border-slate-300 px-2 py-1.5"
            value={objective} onChange={(e) => setObjective(e.target.value as ContentObjective)}>
            {CONTENT_OBJECTIVES.map((o) => (
              <option key={o} value={o}>{OBJECTIVE_LABELS[o]}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={create.isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          Add idea
        </button>
        <button type="button"
          className="rounded-md border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
          onClick={() => { setAiOpen(true); setCandidates([]); }}>
          ✨ Suggest ideas with AI
        </button>
      </form>

      {/* AI suggestion modal */}
      {aiOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-6"
          onClick={() => setAiOpen(false)}>
          <div className="max-h-full w-[640px] overflow-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Suggest ideas with AI</h2>
            <p className="mt-1 text-sm text-slate-500">
              Generate a batch, tick the keepers, add them to the board. Repeat until the month is full.
            </p>
            <div className="mt-4 flex items-end gap-2">
              <label className="flex-1 text-sm">
                <span className="font-semibold">Theme / focus (optional)</span>
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                  placeholder="e.g. test automation ROI, August event, hiring push"
                  value={aiTheme} onChange={(e) => setAiTheme(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="font-semibold">How many</span>
                <select className="mt-1 block rounded border border-slate-300 px-2 py-1.5"
                  value={aiCount} onChange={(e) => setAiCount(Number(e.target.value))}>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                </select>
              </label>
              <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                disabled={aiBusy} onClick={suggest}>
                {aiBusy ? 'Generating…' : candidates.length ? 'Regenerate' : 'Generate'}
              </button>
            </div>

            {aiProvider === 'mock' && candidates.length > 0 && (
              <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                Sample ideas (offline mode) — add ANTHROPIC_API_KEY to the API to generate real,
                brand-aware ideas.
              </div>
            )}

            <div className="mt-4 space-y-2">
              {candidates.map((c, i) => (
                <label key={i}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${c.checked ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'}`}>
                  <input type="checkbox" className="mt-1" checked={c.checked}
                    onChange={() =>
                      setCandidates((cs) => cs.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))
                    } />
                  <span>
                    <span className="block text-sm font-semibold">{c.title}</span>
                    {c.angle && <span className="block text-xs text-slate-500">{c.angle}</span>}
                    <span className="text-xs text-indigo-600">{OBJECTIVE_LABELS[c.objective] ?? c.objective}</span>
                  </span>
                </label>
              ))}
            </div>

            {candidates.length > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  {candidates.filter((c) => c.checked).length} of {candidates.length} selected
                </span>
                <div className="space-x-2">
                  <button className="rounded-md border border-slate-300 px-4 py-2 text-sm" onClick={() => setAiOpen(false)}>
                    Cancel
                  </button>
                  <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    onClick={addSelectedCandidates}>
                    Add selected to ideas
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* multi-select action bar */}
      {selected.size > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm">
          <span className="font-semibold text-indigo-800">{selected.size} selected</span>
          <button className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700"
            onClick={expandSelected}
            title="Generate two distinct directions for each selected idea">
            ✨ Expand into 2 directions each
          </button>
          <button className="rounded-md border border-green-300 bg-white px-3 py-1.5 text-green-700 hover:bg-green-50"
            onClick={() => bulkStatus('APPROVED')}>
            Approve
          </button>
          <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100"
            onClick={() => bulkStatus('REJECTED')}>
            Reject
          </button>
          <button className="ml-auto text-slate-500 hover:text-slate-700" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {error != null && (
        <div className="mt-4 text-sm text-red-600">Could not load ideas — check your sign-in and client selection.</div>
      )}

      {/* board */}
      <div className="mt-6 grid flex-1 grid-cols-3 gap-4 overflow-auto">
        {COLUMNS.map((col) => {
          const items = (ideas ?? []).filter((i) => col.statuses.includes(i.status));
          return (
            <div key={col.key} className="flex flex-col rounded-xl bg-slate-100 p-3">
              <div className="mb-2 px-1">
                <span className="font-semibold">{col.title}</span>
                <span className="ml-2 rounded-full bg-slate-200 px-2 text-xs">{items.length}</span>
                <div className="text-xs text-slate-400">{col.hint}</div>
              </div>
              <div className="space-y-2 overflow-auto">
                {items.map((idea) => (
                  <div key={idea.id}
                    className={`rounded-lg border bg-white p-3 shadow-sm ${selected.has(idea.id) ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200'}`}>
                    <div className="flex items-start gap-2">
                      {col.key === 'ideas' && (
                        <input type="checkbox" className="mt-0.5" checked={selected.has(idea.id)}
                          onChange={() => toggleSelected(idea.id)} />
                      )}
                      <div className="text-sm font-semibold">{idea.title}</div>
                    </div>
                    {idea.angle && <div className="mt-0.5 text-xs text-slate-500">{idea.angle}</div>}
                    <div className="mt-1 text-xs text-indigo-600">{OBJECTIVE_LABELS[idea.objective] ?? idea.objective}</div>
                    <div className="mt-2 flex gap-1.5 text-xs">
                      {col.key === 'ideas' && (
                        <>
                          <button className="rounded border border-green-300 px-2 py-1 text-green-700 hover:bg-green-50"
                            onClick={() => setStatus.mutate({ id: idea.id, status: 'APPROVED' })}>
                            Approve
                          </button>
                          <button className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
                            onClick={() => setStatus.mutate({ id: idea.id, status: 'REJECTED' })}>
                            Reject
                          </button>
                        </>
                      )}
                      {col.key === 'approved' && (
                        <button className="rounded bg-indigo-600 px-2 py-1 font-semibold text-white hover:bg-indigo-700"
                          onClick={() => navigate(`/playground?ideaTitle=${encodeURIComponent(idea.title)}`)}>
                          Design →
                        </button>
                      )}
                      {col.key === 'rejected' && (
                        <button className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
                          onClick={() => setStatus.mutate({ id: idea.id, status: 'EDITED' })}>
                          Restore
                        </button>
                      )}
                      <button className="ml-auto rounded border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50"
                        onClick={() => remove.mutate(idea.id)}>
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
