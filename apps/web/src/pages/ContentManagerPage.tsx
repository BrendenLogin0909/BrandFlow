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

/** One expanded idea: the original (keep or reject) plus its directions. */
interface ExpandGroup {
  parent: { id: string; title: string; angle: string | null; objective: string; keep: boolean };
  directions: Candidate[];
}

/** A drafted post (PostPackage) — the Draft stage of the pipeline. */
interface Draft {
  id: string;
  ideaId: string | null;
  internalTitle: string;
  status: string;
  hookOptions: string[] | null;
  mainText: string | null;
  cta: string | null;
  hashtags: string[];
  firstComment: string | null;
  suggestedVisualFormat: string | null;
  onImageText: { headline: string; support?: string; badge?: string } | null;
  slideTexts: { title: string; body: string; iconName?: string }[] | null;
}

/** Copy shape returned by the directions endpoint. */
interface DirectionCopy {
  hooks: string[];
  mainText: string;
  cta: string;
  hashtags: string[];
  firstComment: string;
  suggestedVisualFormat: string;
  onImageText: { headline: string; support?: string; badge?: string };
  slides?: { title: string; body: string; iconName?: string }[];
  altText: string;
  shortVersion?: string;
}

const COLUMNS: { key: string; title: string; hint: string; statuses: Idea['status'][] }[] = [
  { key: 'ideas', title: 'Ideas', hint: 'Captured, not yet approved', statuses: ['SUGGESTED', 'EDITED'] },
  { key: 'approved', title: 'Approved', hint: 'Ready to draft', statuses: ['APPROVED'] },
  { key: 'drafts', title: 'Drafts', hint: 'AI-written copy, human-edited', statuses: [] },
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

  // AI suggestion modal ('suggest' = fresh batch, 'expand' = directions for selected ideas)
  const [aiMode, setAiMode] = useState<'suggest' | 'expand'>('suggest');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTheme, setAiTheme] = useState('');
  const [aiCount, setAiCount] = useState(5);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  // Brand topics (content pillars): one selected focuses the batch, several
  // spread the ideas across them.
  const [pickedTopics, setPickedTopics] = useState<Set<string>>(new Set());
  const [newTopic, setNewTopic] = useState('');
  const [topicError, setTopicError] = useState<string | null>(null);
  const { data: brandProfiles, isLoading: profilesLoading } = useQuery({
    queryKey: ['brand-profiles'],
    queryFn: () =>
      clientApi<{ id: string; pillars: { id: string; name: string }[] }[]>('/brand-profiles'),
  });
  const topics = [...new Set((brandProfiles ?? []).flatMap((p) => p.pillars.map((x) => x.name)))];

  async function addTopic() {
    const name = newTopic.trim();
    if (!name) return;
    if (profilesLoading) return; // profiles not loaded yet — Enter came too early
    setTopicError(null);
    try {
      // Topics attach to a brand profile; create a starter one if the
      // client has none yet (previously this failed silently).
      let profileId = brandProfiles?.[0]?.id;
      if (!profileId) {
        const created = await clientApi<{ id: string }>('/brand-profiles', {
          method: 'POST',
          body: JSON.stringify({ name: 'Default brand' }),
        });
        profileId = created.id;
      }
      await clientApi(`/brand-profiles/${profileId}/pillars`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setNewTopic('');
      setPickedTopics((s) => new Set([...s, name]));
      queryClient.invalidateQueries({ queryKey: ['brand-profiles'] });
    } catch (e) {
      setTopicError(`Could not add topic: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // multi-select in the Ideas column
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // inline editing of a card's title/angle
  const [editing, setEditing] = useState<{ id: string; title: string; angle: string } | null>(null);

  async function saveEdit() {
    if (!editing || !editing.title.trim()) return;
    await clientApi(`/ideas/${editing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: editing.title.trim(), angle: editing.angle.trim() || undefined }),
    });
    setEditing(null);
    invalidate();
  }

  const { data: ideas, error } = useQuery({
    queryKey: ['ideas'],
    queryFn: () => clientApi<Idea[]>('/ideas'),
  });

  // ideas that already have a saved design reopen it instead of starting fresh
  const { data: drafts } = useQuery({
    queryKey: ['design-drafts'],
    queryFn: () => clientApi<{ id: string; ideaId: string | null }[]>('/design-drafts'),
  });
  const draftByIdea = new Map((drafts ?? []).filter((d) => d.ideaId).map((d) => [d.ideaId!, d.id]));

  // drafted posts (the Draft column)
  const { data: packages } = useQuery({
    queryKey: ['post-packages'],
    queryFn: () => clientApi<Draft[]>('/post-packages'),
  });
  const activeDrafts = (packages ?? []).filter((p) =>
    ['DRAFTING', 'GENERATED', 'IN_REVIEW', 'NEEDS_CHANGES'].includes(p.status),
  );
  const packageByIdea = new Map(activeDrafts.filter((p) => p.ideaId).map((p) => [p.ideaId!, p]));

  const [draftingIdeaId, setDraftingIdeaId] = useState<string | null>(null);
  async function createDraft(ideaId: string) {
    setDraftingIdeaId(ideaId);
    try {
      await clientApi('/post-packages/draft-sync', { method: 'POST', body: JSON.stringify({ ideaId }) });
      queryClient.invalidateQueries({ queryKey: ['post-packages'] });
    } finally {
      setDraftingIdeaId(null);
    }
  }

  // inline draft editing modal
  const [editDraft, setEditDraft] = useState<{
    id: string; hook: string; mainText: string; cta: string; hashtags: string; firstComment: string;
  } | null>(null);
  async function saveDraftEdit() {
    if (!editDraft) return;
    await clientApi(`/post-packages/${editDraft.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        hookOptions: [editDraft.hook],
        mainText: editDraft.mainText,
        cta: editDraft.cta,
        hashtags: editDraft.hashtags.split(/[,\s]+/).filter(Boolean),
        firstComment: editDraft.firstComment,
      }),
    });
    setEditDraft(null);
    queryClient.invalidateQueries({ queryKey: ['post-packages'] });
  }

  // draft directions modal (same keep-what-you-like pattern, applied as ONE choice)
  const [dirState, setDirState] = useState<{
    pkgId: string; busy: boolean; original: { hook?: string; mainText?: string | null } | null;
    directions: DirectionCopy[]; picked: number | null;
  } | null>(null);
  async function openDirections(pkg: Draft) {
    setDirState({ pkgId: pkg.id, busy: true, original: null, directions: [], picked: null });
    try {
      const res = await clientApi<{ original: { hook?: string; mainText?: string | null }; directions: DirectionCopy[] }>(
        `/post-packages/${pkg.id}/directions-sync`,
        { method: 'POST', body: '{}' },
      );
      setDirState({ pkgId: pkg.id, busy: false, original: res.original, directions: res.directions, picked: null });
    } catch {
      setDirState(null);
    }
  }
  async function applyDirection() {
    if (!dirState || dirState.picked === null) return;
    await clientApi(`/post-packages/${dirState.pkgId}/apply-draft`, {
      method: 'POST',
      body: JSON.stringify(dirState.directions[dirState.picked]),
    });
    setDirState(null);
    queryClient.invalidateQueries({ queryKey: ['post-packages'] });
  }

  async function archiveDraft(pkg: Draft) {
    if (!confirm(`Archive draft "${pkg.internalTitle}"?`)) return;
    await clientApi(`/post-packages/${pkg.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'ARCHIVED' }) });
    queryClient.invalidateQueries({ queryKey: ['post-packages'] });
  }

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
        {
          method: 'POST',
          body: JSON.stringify({
            topics: pickedTopics.size ? [...pickedTopics] : undefined,
            theme: aiTheme || undefined,
            count: aiCount,
          }),
        },
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

  const [expandGroups, setExpandGroups] = useState<ExpandGroup[]>([]);

  async function expandSelected() {
    if (selected.size === 0) return;
    // directions are curated in the modal — nothing changes until Apply
    setAiMode('expand');
    setExpandGroups([]);
    setAiOpen(true);
    setAiBusy(true);
    try {
      const res = await clientApi<{
        groups: { parent: ExpandGroup['parent']; directions: Omit<Candidate, 'checked'>[] }[];
        provider: string;
      }>('/ideas/expand-sync', { method: 'POST', body: JSON.stringify({ ideaIds: [...selected] }) });
      setExpandGroups(
        res.groups.map((g) => ({
          parent: { ...g.parent, keep: true },
          directions: g.directions.map((d) => ({ ...d, checked: false })),
        })),
      );
      setAiProvider(res.provider);
      setSelected(new Set());
    } finally {
      setAiBusy(false);
    }
  }

  /** Keep ticked directions; an unticked original moves to Rejected. */
  async function applyExpand() {
    const keepDirections = expandGroups.flatMap((g) =>
      g.directions.filter((d) => d.checked).map(({ checked: _c, ...idea }) => idea),
    );
    if (keepDirections.length)
      await clientApi('/ideas/bulk', { method: 'POST', body: JSON.stringify({ ideas: keepDirections }) });
    await Promise.all(
      expandGroups
        .filter((g) => !g.parent.keep)
        .map((g) =>
          clientApi(`/ideas/${g.parent.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'REJECTED' }) }),
        ),
    );
    setExpandGroups([]);
    setAiOpen(false);
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
          onClick={() => { setAiMode('suggest'); setAiOpen(true); setCandidates([]); }}>
          ✨ Suggest ideas with AI
        </button>
      </form>

      {/* AI suggestion modal */}
      {aiOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-6"
          onClick={() => setAiOpen(false)}>
          <div className="max-h-full w-[640px] overflow-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">
              {aiMode === 'expand' ? 'Directions for your selected ideas' : 'Suggest ideas with AI'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {aiMode === 'expand'
                ? 'Tick everything worth keeping — original included. Untick an original and it moves to Rejected.'
                : 'Generate a batch, tick the keepers, add them to the board. Repeat until the month is full.'}
            </p>
            {aiMode === 'expand' && aiBusy && (
              <div className="mt-4 text-sm text-slate-500">Generating directions…</div>
            )}

            {aiMode === 'suggest' && (
            <>
            {/* brand topics */}
            <div className="mt-4">
              <div className="text-sm font-semibold">
                Brand topics
                <span className="ml-2 font-normal text-slate-400">
                  pick one to focus the batch, several for variety, none for open ideas
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {topics.map((t) => {
                  const on = pickedTopics.has(t);
                  return (
                    <button key={t} type="button"
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        on ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-300'
                      }`}
                      onClick={() =>
                        setPickedTopics((s) => {
                          const next = new Set(s);
                          on ? next.delete(t) : next.add(t);
                          return next;
                        })
                      }>
                      {t}
                    </button>
                  );
                })}
                <input
                  className="w-40 rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs"
                  placeholder="+ add topic…"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTopic();
                    }
                  }}
                />
              </div>
              {topics.length === 0 && !topicError && (
                <div className="mt-1 text-xs text-slate-400">
                  No topics yet — add the subjects your company talks about (they save to the brand
                  profile as content pillars).
                </div>
              )}
              {topicError && <div className="mt-1 text-xs text-red-600">{topicError}</div>}
            </div>

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
            </>
            )}

            {aiProvider === 'mock' && candidates.length > 0 && (
              <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                Sample ideas (offline mode) — add an AI API key to generate real, brand-aware ideas.
              </div>
            )}

            {aiMode === 'suggest' && (
              <>
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
              </>
            )}

            {aiMode === 'expand' && expandGroups.length > 0 && (
              <>
                <div className="mt-4 space-y-4">
                  {expandGroups.map((g, gi) => (
                    <div key={g.parent.id} className="rounded-xl border border-slate-300 p-3">
                      {expandGroups.length > 1 && (
                        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                          Idea {gi + 1} of {expandGroups.length}
                        </div>
                      )}
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${g.parent.keep ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 opacity-70'}`}>
                        <input type="checkbox" className="mt-1" checked={g.parent.keep}
                          onChange={() =>
                            setExpandGroups((gs) =>
                              gs.map((x, j) => (j === gi ? { ...x, parent: { ...x.parent, keep: !x.parent.keep } } : x)),
                            )
                          } />
                        <span>
                          <span className="mr-2 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                            Original
                          </span>
                          <span className="text-sm font-semibold">{g.parent.title}</span>
                          {g.parent.angle && <span className="block text-xs text-slate-500">{g.parent.angle}</span>}
                          {!g.parent.keep && (
                            <span className="block text-xs text-red-600">will be moved to Rejected</span>
                          )}
                        </span>
                      </label>
                      <div className="mt-1.5 space-y-1.5 pl-4">
                        {g.directions.map((d, di) => (
                          <label key={di}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${d.checked ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'}`}>
                            <input type="checkbox" className="mt-1" checked={d.checked}
                              onChange={() =>
                                setExpandGroups((gs) =>
                                  gs.map((x, j) =>
                                    j === gi
                                      ? { ...x, directions: x.directions.map((y, k) => (k === di ? { ...y, checked: !y.checked } : y)) }
                                      : x,
                                  ),
                                )
                              } />
                            <span>
                              <span className="mr-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
                                Direction {di + 1}
                              </span>
                              <span className="text-sm font-semibold">{d.title}</span>
                              {d.angle && <span className="block text-xs text-slate-500">{d.angle}</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm text-slate-500">
                    keeping{' '}
                    {expandGroups.filter((g) => g.parent.keep).length +
                      expandGroups.reduce((n, g) => n + g.directions.filter((d) => d.checked).length, 0)}{' '}
                    of {expandGroups.length + expandGroups.reduce((n, g) => n + g.directions.length, 0)}
                  </span>
                  <div className="space-x-2">
                    <button className="rounded-md border border-slate-300 px-4 py-2 text-sm" onClick={() => setAiOpen(false)}>
                      Cancel
                    </button>
                    <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                      onClick={applyExpand}>
                      Apply selection
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* draft copy editor */}
      {editDraft && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-6"
          onClick={() => setEditDraft(null)}>
          <div className="max-h-full w-[640px] overflow-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Edit draft</h2>
            <label className="mt-4 block text-sm">
              <span className="font-semibold">Hook</span>
              <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={editDraft.hook} onChange={(e) => setEditDraft({ ...editDraft, hook: e.target.value })} />
            </label>
            <label className="mt-3 block text-sm">
              <span className="font-semibold">Post text</span>
              <textarea className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" rows={9}
                value={editDraft.mainText} onChange={(e) => setEditDraft({ ...editDraft, mainText: e.target.value })} />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="font-semibold">CTA</span>
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                  value={editDraft.cta} onChange={(e) => setEditDraft({ ...editDraft, cta: e.target.value })} />
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Hashtags</span>
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                  value={editDraft.hashtags} onChange={(e) => setEditDraft({ ...editDraft, hashtags: e.target.value })} />
              </label>
            </div>
            <label className="mt-3 block text-sm">
              <span className="font-semibold">First comment</span>
              <textarea className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" rows={2}
                value={editDraft.firstComment} onChange={(e) => setEditDraft({ ...editDraft, firstComment: e.target.value })} />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-md border border-slate-300 px-4 py-2 text-sm" onClick={() => setEditDraft(null)}>
                Cancel
              </button>
              <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                onClick={saveDraftEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* draft directions chooser */}
      {dirState && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-6"
          onClick={() => setDirState(null)}>
          <div className="max-h-full w-[720px] overflow-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Draft directions</h2>
            <p className="mt-1 text-sm text-slate-500">
              Two alternative drafts — pick the one to apply, or keep the original as is.
            </p>
            {dirState.busy && <div className="mt-4 text-sm text-slate-500">Writing two alternative drafts…</div>}
            {!dirState.busy && dirState.original && (
              <div className="mt-4 space-y-3">
                <label className={`block cursor-pointer rounded-lg border p-3 ${dirState.picked === null ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'}`}>
                  <input type="radio" className="mr-2" checked={dirState.picked === null}
                    onChange={() => setDirState({ ...dirState, picked: null })} />
                  <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Original</span>
                  <span className="ml-2 text-sm font-semibold">{dirState.original.hook}</span>
                  <div className="mt-1 line-clamp-3 whitespace-pre-line pl-6 text-xs text-slate-500">{dirState.original.mainText}</div>
                </label>
                {dirState.directions.map((d, i) => (
                  <label key={i} className={`block cursor-pointer rounded-lg border p-3 ${dirState.picked === i ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'}`}>
                    <input type="radio" className="mr-2" checked={dirState.picked === i}
                      onChange={() => setDirState({ ...dirState, picked: i })} />
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
                      Direction {i + 1}
                    </span>
                    <span className="ml-2 text-sm font-semibold">{d.hooks[0]}</span>
                    <div className="mt-1 line-clamp-3 whitespace-pre-line pl-6 text-xs text-slate-500">{d.mainText}</div>
                  </label>
                ))}
                <div className="flex justify-end gap-2">
                  <button className="rounded-md border border-slate-300 px-4 py-2 text-sm" onClick={() => setDirState(null)}>
                    Cancel
                  </button>
                  <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    disabled={dirState.picked === null} onClick={applyDirection}>
                    Apply direction
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
            title="Generate two distinct directions per selected idea, then choose what to keep">
            ✨ Expand into 2 directions{selected.size > 1 ? ' each' : ''}
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
      <div className="mt-6 grid flex-1 grid-cols-4 gap-4 overflow-auto">
        {COLUMNS.map((col) => {
          if (col.key === 'drafts')
            return (
              <div key="drafts" className="flex flex-col rounded-xl bg-slate-100 p-3">
                <div className="mb-2 px-1">
                  <span className="font-semibold">{col.title}</span>
                  <span className="ml-2 rounded-full bg-slate-200 px-2 text-xs">{activeDrafts.length}</span>
                  <div className="text-xs text-slate-400">{col.hint}</div>
                </div>
                <div className="space-y-2 overflow-auto">
                  {activeDrafts.map((pkg) => (
                    <div key={pkg.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="text-sm font-semibold">{pkg.internalTitle}</div>
                      {pkg.hookOptions?.[0] && (
                        <div className="mt-1 text-xs italic text-slate-600">“{pkg.hookOptions[0]}”</div>
                      )}
                      {pkg.mainText && (
                        <div className="mt-1 line-clamp-2 text-xs text-slate-500">{pkg.mainText}</div>
                      )}
                      <div className="mt-1 flex gap-1 text-[10px]">
                        {pkg.suggestedVisualFormat && (
                          <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-semibold text-indigo-700">
                            {pkg.suggestedVisualFormat.replaceAll('_', ' ')}
                          </span>
                        )}
                        {pkg.slideTexts && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                            {pkg.slideTexts.length} slides
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex gap-1.5 text-xs">
                        <button className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50" title="Edit the copy"
                          onClick={() =>
                            setEditDraft({
                              id: pkg.id,
                              hook: pkg.hookOptions?.[0] ?? '',
                              mainText: pkg.mainText ?? '',
                              cta: pkg.cta ?? '',
                              hashtags: (pkg.hashtags ?? []).join(' '),
                              firstComment: pkg.firstComment ?? '',
                            })
                          }>
                          ✎ Edit
                        </button>
                        <button className="rounded border border-indigo-300 px-2 py-1 text-indigo-700 hover:bg-indigo-50"
                          title="Two alternative drafts to choose from" onClick={() => openDirections(pkg)}>
                          ✨ Directions
                        </button>
                        <button className="rounded bg-indigo-600 px-2 py-1 font-semibold text-white hover:bg-indigo-700"
                          onClick={() => navigate(`/playground?package=${pkg.id}`)}>
                          🎨 Design
                        </button>
                        <button className="ml-auto rounded border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50"
                          title="Archive draft" onClick={() => archiveDraft(pkg)}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                  {activeDrafts.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
                      Draft an approved idea to start
                    </div>
                  )}
                </div>
              </div>
            );
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
                    {editing?.id === idea.id ? (
                      <div className="space-y-1.5">
                        <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm font-semibold"
                          value={editing.title} autoFocus
                          onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                        <textarea className="w-full rounded border border-slate-300 px-2 py-1 text-xs" rows={2}
                          placeholder="angle / notes" value={editing.angle}
                          onChange={(e) => setEditing({ ...editing, angle: e.target.value })} />
                        <div className="flex gap-1.5 text-xs">
                          <button className="rounded bg-indigo-600 px-2 py-1 font-semibold text-white" onClick={saveEdit}>
                            Save
                          </button>
                          <button className="rounded border border-slate-300 px-2 py-1" onClick={() => setEditing(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                    <>
                    <div className="flex items-start gap-2">
                      {col.key === 'ideas' && (
                        <input type="checkbox" className="mt-0.5" checked={selected.has(idea.id)}
                          onChange={() => toggleSelected(idea.id)} />
                      )}
                      <div className="flex-1 text-sm font-semibold">{idea.title}</div>
                      <button className="text-slate-400 hover:text-indigo-600" title="Edit"
                        onClick={() => setEditing({ id: idea.id, title: idea.title, angle: idea.angle ?? '' })}>
                        ✎
                      </button>
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
                        <>
                          {packageByIdea.has(idea.id) ? (
                            <span className="rounded bg-slate-100 px-2 py-1 text-slate-500" title="This idea has a draft in the Drafts column">
                              drafted ✓
                            </span>
                          ) : (
                            <button className="rounded bg-indigo-600 px-2 py-1 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                              disabled={draftingIdeaId === idea.id}
                              title="AI writes the full LinkedIn copy for this idea"
                              onClick={() => createDraft(idea.id)}>
                              {draftingIdeaId === idea.id ? 'Drafting…' : '✨ Draft'}
                            </button>
                          )}
                          {draftByIdea.has(idea.id) ? (
                            <button className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-100"
                              title="Reopen the saved design for this idea"
                              onClick={() => navigate(`/playground?draft=${draftByIdea.get(idea.id)}`)}>
                              Open design 🎨
                            </button>
                          ) : (
                            <button className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
                              title="Skip drafting and design directly"
                              onClick={() => navigate(`/playground?idea=${idea.id}`)}>
                              Design →
                            </button>
                          )}
                        </>
                      )}
                      {col.key === 'rejected' && (
                        <button className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
                          onClick={() => setStatus.mutate({ id: idea.id, status: 'EDITED' })}>
                          Restore
                        </button>
                      )}
                      <button className="ml-auto rounded border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50"
                        title="Delete idea"
                        onClick={() => {
                          if (confirm(`Delete "${idea.title}"?`)) remove.mutate(idea.id);
                        }}>
                        ✕
                      </button>
                    </div>
                    </>
                    )}
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
