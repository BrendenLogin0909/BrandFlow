/**
 * Recipe Playground — runs the full design engine in the browser with no
 * backend, database, AI key or design-SDK licence: pick a recipe and
 * variant, edit the slot content and brand colours, and the deterministic
 * layout engine + validation engine + SVG exporter produce live layered
 * previews. This is the same code path the AI pipeline uses server-side
 * (the AI only fills the same slots this form fills).
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { BrandTokensSnapshot, InternalDesignDocument } from '@brandflow/design-schema';
import { validateDesignDocument } from '@brandflow/design-schema';
import { exportPptxBlob } from '@brandflow/exporters/pptx';
import JSZip from 'jszip';
import { clientApi, getAccessToken, getActiveClientId } from '../lib/api';
import { RECIPES, applyStyleDirectives, HEADLINE_TREATMENTS, MOTIFS } from '@brandflow/layout-recipes';
import type {
  HeadlineTreatment,
  LayoutRecipe,
  Motif,
  RecipeFill,
  SlotValue,
} from '@brandflow/layout-recipes';
import { exportPageSvg } from '@brandflow/exporters/svg';

const DEFAULT_BRAND = {
  primary: '#1a3c8f',
  secondary: '#4a6fd4',
  accent: '#e8b23a',
  neutral: '#8a8f98',
  background: '#ffffff',
  text: '#101418',
};

const DEFAULT_TEXT: Record<string, string> = {
  quote: 'The best brands are built one consistent post at a time.',
  authorName: 'Alex Rivera',
  authorTitle: 'CMO, Acme Robotics',
  statValue: '73%',
  statLabel: 'of B2B buyers check LinkedIn before a first meeting',
  context: 'Source: 2026 B2B Buyer Behaviour Survey',
  headline: 'Stop posting. Start compounding.',
  support: 'Three habits that turn LinkedIn activity into pipeline.',
  hook: '5 hidden costs of manual QA',
  kicker: 'Engineering ROI',
  badge: 'NEW',
  cta: 'Follow for weekly insights.',
  problemTitle: 'Posting without a point of view',
  problem: 'Most company pages publish generic content nobody remembers.',
  insightTitle: 'Audiences follow opinions, not logos',
  insight: 'The accounts that grow take positions and defend them.',
  recommendationTitle: 'Pick three hills to stand on',
  recommendation: 'Define three strong opinions and reinforce one per post.',
};

const DEFAULT_LIST = [
  { title: 'Consistency', text: 'Show up on a schedule your audience can rely on.', iconName: 'calendar' },
  { title: 'Voice', text: 'Sound like a person, not a press release.', iconName: 'mic' },
  { title: 'Proof', text: 'Back every claim with a number or a story.', iconName: 'bar-chart' },
];

/** Everything needed to restore the playground controls from a saved draft. */
interface PlaygroundSource {
  recipeId: string;
  variant: string;
  treatment: HeadlineTreatment;
  motif: Motif;
  brand: typeof DEFAULT_BRAND;
  fill: RecipeFill;
  bestPractices?: boolean;
}

function defaultFill(recipe: LayoutRecipe): RecipeFill {
  const slots: Record<string, SlotValue> = {};
  for (const slot of recipe.slots) {
    if (slot.kind === 'text') {
      const t = DEFAULT_TEXT[slot.id] ?? 'Editable sample text';
      slots[slot.id] = { kind: 'text', text: t.slice(0, slot.maxChars) };
    } else if (slot.kind === 'list') slots[slot.id] = { kind: 'list', items: DEFAULT_LIST };
    else if (slot.kind === 'colourTreatment') slots[slot.id] = { kind: 'colourTreatment', treatment: 'light' };
    else if (slot.kind === 'image') slots[slot.id] = { kind: 'image', assetId: 'demo-photo' };
    else if (slot.kind === 'icon') slots[slot.id] = { kind: 'icon', provider: 'lucide', name: 'sparkles' };
  }
  return { slots };
}

export function PlaygroundPage() {
  const [recipeId, setRecipeId] = useState(RECIPES[0]!.id);
  const recipe = RECIPES.find((r) => r.id === recipeId)!;
  const [variant, setVariant] = useState(recipe.variants[0]!.id);
  const [brand, setBrand] = useState(DEFAULT_BRAND);
  const [fill, setFill] = useState<RecipeFill>(() => defaultFill(RECIPES[0]!));
  const [treatment, setTreatment] = useState<HeadlineTreatment>('plain');
  const [motif, setMotif] = useState<Motif>('none');
  const [bestPractices, setBestPractices] = useState(true);
  const [saveState, setSaveState] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  // Arriving from the content manager (?ideaTitle=...): prefill the
  // design's primary text slot with the approved idea.
  useEffect(() => {
    const ideaTitle = searchParams.get('ideaTitle');
    if (!ideaTitle) return;
    setFill((f) => {
      const primary = recipe.slots.find((s) => s.kind === 'text' && s.required);
      if (!primary) return f;
      return {
        slots: {
          ...f.slots,
          [primary.id]: { kind: 'text', text: ideaTitle.slice(0, primary.maxChars) },
        },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Reopen a saved draft from the design library (?draft=id)
  useEffect(() => {
    const draftId = searchParams.get('draft');
    if (!draftId || !getAccessToken()) return;
    clientApi<{ name: string; playgroundSource: PlaygroundSource | null }>(
      `/design-drafts/${draftId}`,
    ).then((draft) => {
      const src = draft.playgroundSource;
      if (!src) return;
      setRecipeId(src.recipeId);
      setVariant(src.variant);
      setTreatment(src.treatment);
      setMotif(src.motif);
      setBrand(src.brand);
      setFill(src.fill);
      setBestPractices(src.bestPractices ?? true);
    }).catch(() => setSaveState('Could not load draft'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const activeVariant = recipe.variants.some((v) => v.id === variant)
    ? variant
    : recipe.variants[0]!.id;

  const result = useMemo(() => {
    const tokens: BrandTokensSnapshot = {
      colours: brand,
      fonts: { heading: 'Arial', body: 'Arial' },
      logoAssetIds: [],
    };
    try {
      const base: InternalDesignDocument = recipe.layout(fill, {
        documentId: crypto.randomUUID(),
        brandProfileId: 'playground',
        clientCompanyId: 'playground',
        brandTokens: tokens,
        variant: activeVariant,
        seed: 7,
        newId: () => crypto.randomUUID(),
      });
      const doc = applyStyleDirectives(
        base,
        { headlineTreatment: treatment, motif, motifIconName: 'route', relaxContrast: !bestPractices },
        () => crypto.randomUUID(),
      );
      const report = validateDesignDocument(doc, {
        contrastMode: bestPractices ? 'enforce' : 'warn',
      });
      const svgs = doc.pages.map((_, i) => exportPageSvg(doc, i));
      return { doc, report, svgs, error: null as string | null };
    } catch (e) {
      return { doc: null, report: null, svgs: [], error: String(e) };
    }
  }, [recipe, activeVariant, brand, fill, treatment, motif, bestPractices]);

  async function saveDraft() {
    if (!result.doc) return;
    if (!getAccessToken() || !getActiveClientId()) {
      setSaveState('Sign in and select a client to save drafts');
      return;
    }
    const name = window.prompt('Draft name', `${recipe.name} — ${new Date().toLocaleDateString()}`);
    if (!name) return;
    setSaveState('Saving…');
    try {
      const source: PlaygroundSource = {
        recipeId, variant: activeVariant, treatment, motif, brand, fill, bestPractices,
      };
      await clientApi('/design-drafts', {
        method: 'POST',
        body: JSON.stringify({ name, internalDoc: result.doc, playgroundSource: source }),
      });
      setSaveState(`Saved "${name}" to the design library ✓`);
    } catch (e) {
      setSaveState(`Save failed: ${String(e)}`);
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPptx() {
    if (!result.doc) return;
    downloadBlob(await exportPptxBlob(result.doc), `${recipe.id}.pptx`);
  }

  async function downloadSvgs() {
    if (!result.svgs.length) return;
    if (result.svgs.length === 1) {
      downloadBlob(new Blob([result.svgs[0]!], { type: 'image/svg+xml' }), `${recipe.id}.svg`);
      return;
    }
    const zip = new JSZip();
    result.svgs.forEach((svg, i) => zip.file(`${recipe.id}-slide-${i + 1}.svg`, svg));
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `${recipe.id}-svgs.zip`);
  }

  function surprise() {
    const r = RECIPES[Math.floor(Math.random() * RECIPES.length)]!;
    setRecipeId(r.id);
    setVariant(r.variants[Math.floor(Math.random() * r.variants.length)]!.id);
    setFill(defaultFill(r));
    setTreatment(HEADLINE_TREATMENTS[Math.floor(Math.random() * HEADLINE_TREATMENTS.length)]!);
    setMotif(MOTIFS[Math.floor(Math.random() * MOTIFS.length)]!);
  }

  function selectRecipe(id: string) {
    const r = RECIPES.find((x) => x.id === id)!;
    setRecipeId(id);
    setVariant(r.variants[0]!.id);
    setFill(defaultFill(r));
  }

  function setTextSlot(id: string, text: string) {
    setFill((f) => ({ slots: { ...f.slots, [id]: { kind: 'text', text } } }));
  }

  function setListSlot(id: string, raw: string) {
    const items = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [title, text, iconName] = line.split('|').map((s) => s.trim());
        return { title: title || undefined, text: text || title || 'item', iconName: iconName || undefined };
      });
    if (items.length) setFill((f) => ({ slots: { ...f.slots, [id]: { kind: 'list', items } } }));
  }

  return (
    <div className="flex h-full">
      {/* controls */}
      <div className="w-96 space-y-4 overflow-auto border-r border-slate-200 bg-white p-5">
        <h1 className="text-lg font-bold">Recipe playground</h1>
        <p className="text-xs text-slate-500">
          The full design engine running in your browser — no backend, AI key or licence. The AI
          pipeline fills exactly these slots; geometry always comes from the recipe.
        </p>

        <label className="block text-sm">
          <span className="font-semibold">Recipe</span>
          <select className="mt-1 w-full rounded border border-slate-300 p-1.5" value={recipeId}
            onChange={(e) => selectRecipe(e.target.value)}>
            {RECIPES.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-semibold">Layout variant</span>
          <select className="mt-1 w-full rounded border border-slate-300 p-1.5" value={activeVariant}
            onChange={(e) => setVariant(e.target.value)}>
            {recipe.variants.map((v) => (
              <option key={v.id} value={v.id}>{v.description}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="font-semibold">Headline style</span>
            <select className="mt-1 w-full rounded border border-slate-300 p-1.5" value={treatment}
              onChange={(e) => setTreatment(e.target.value as HeadlineTreatment)}>
              {HEADLINE_TREATMENTS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Brand motif</span>
            <select className="mt-1 w-full rounded border border-slate-300 p-1.5" value={motif}
              onChange={(e) => setMotif(e.target.value as Motif)}>
              {MOTIFS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>

        <button className="w-full rounded-md bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          onClick={surprise}>
          🎲 Surprise me
        </button>

        <label className="flex items-start gap-2 rounded border border-slate-200 p-3 text-xs text-slate-600">
          <input type="checkbox" className="mt-0.5" checked={bestPractices}
            onChange={(e) => setBestPractices(e.target.checked)} />
          <span>
            <strong>Enforce design best practices</strong> (recommended) — readability contrast is
            required. Untick to allow low-contrast display colours; issues are still reported as
            warnings.
          </span>
        </label>

        <fieldset className="rounded border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase text-slate-400">Brand colours</legend>
          <div className="grid grid-cols-3 gap-2">
            {(['primary', 'accent', 'background', 'text', 'secondary', 'neutral'] as const).map((k) => (
              <label key={k} className="text-xs">
                {k}
                <input type="color" className="block h-8 w-full cursor-pointer" value={brand[k]}
                  onChange={(e) => setBrand((b) => ({ ...b, [k]: e.target.value }))} />
              </label>
            ))}
          </div>
        </fieldset>

        {recipe.slots.map((slot) => {
          const value = fill.slots[slot.id];
          if (slot.kind === 'text')
            return (
              <label key={slot.id} className="block text-sm">
                <span className="font-semibold">{slot.id}</span>
                <span className="ml-1 text-xs text-slate-400">≤{slot.maxChars} chars</span>
                <textarea className="mt-1 w-full rounded border border-slate-300 p-1.5" rows={2}
                  value={value?.kind === 'text' ? value.text : ''}
                  onChange={(e) => setTextSlot(slot.id, e.target.value)} />
              </label>
            );
          if (slot.kind === 'list')
            return (
              <label key={slot.id} className="block text-sm">
                <span className="font-semibold">{slot.id}</span>
                <span className="ml-1 text-xs text-slate-400">one per line: title | body | icon</span>
                <textarea className="mt-1 w-full rounded border border-slate-300 p-1.5 font-mono text-xs" rows={5}
                  defaultValue={DEFAULT_LIST.map((i) => `${i.title} | ${i.text} | ${i.iconName}`).join('\n')}
                  onChange={(e) => setListSlot(slot.id, e.target.value)} />
              </label>
            );
          if (slot.kind === 'colourTreatment')
            return (
              <label key={slot.id} className="block text-sm">
                <span className="font-semibold">Colour treatment</span>
                <select className="mt-1 w-full rounded border border-slate-300 p-1.5"
                  value={value?.kind === 'colourTreatment' ? value.treatment : 'light'}
                  onChange={(e) =>
                    setFill((f) => ({ slots: { ...f.slots, [slot.id]: { kind: 'colourTreatment', treatment: e.target.value as 'light' | 'dark' | 'accent' } } }))
                  }>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="accent">Accent</option>
                </select>
              </label>
            );
          return null;
        })}
      </div>

      {/* preview */}
      <div className="flex-1 overflow-auto bg-slate-100 p-6">
        <div className="mb-4 flex items-center gap-2">
          <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            onClick={saveDraft}>
            Save draft
          </button>
          <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            onClick={downloadPptx}
            title="Editable PowerPoint — imports into Canva, Google Slides, PowerPoint">
            Export PPTX
          </button>
          <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            onClick={downloadSvgs}
            title="Layered SVG per slide — opens editable in Figma, Inkscape, Penpot">
            Export SVGs
          </button>
          {saveState && <span className="text-sm text-slate-500">{saveState}</span>}
        </div>
        {result.error && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{result.error}</div>
        )}
        {result.report && (
          <div className={`mb-4 rounded border p-3 text-sm ${result.report.passed ? 'border-green-300 bg-green-50 text-green-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
            <strong>Validation:</strong>{' '}
            {result.report.passed
              ? 'passed — on-brand, readable, inside safe areas'
              : `${result.report.errors.length} error(s)`}
            {result.report.errors.map((e, i) => (
              <div key={i} className="mt-1 text-xs">✕ [{e.ruleId}] {e.message}</div>
            ))}
            {result.report.warnings.map((w, i) => (
              <div key={i} className="mt-1 text-xs opacity-70">⚠ [{w.ruleId}] {w.message}</div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-4">
          {result.svgs.map((svg, i) => (
            <div key={i} className="w-64">
              <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm [&_svg]:h-auto [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: svg }} />
              {result.svgs.length > 1 && (
                <div className="mt-1 text-center text-xs text-slate-400">Slide {i + 1}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
