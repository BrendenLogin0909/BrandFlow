/**
 * Recipe Playground — runs the full design engine in the browser with no
 * backend, database, AI key or design-SDK licence: pick a recipe and
 * variant, edit the slot content and brand colours, and the deterministic
 * layout engine + validation engine + SVG exporter produce live layered
 * previews. This is the same code path the AI pipeline uses server-side
 * (the AI only fills the same slots this form fills).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { InternalDesignDocument, PlaygroundMode } from '@brandflow/design-schema';
import type { VisualDirection } from '@brandflow/shared';
import { parseDesignDocument } from '@brandflow/design-schema';
import { GOOGLE_FONTS, WEB_SAFE_FONTS, googleFontsCssUrl, fontStack } from '@brandflow/design-schema';
import { exportPptxBlob } from '@brandflow/exporters/pptx';
import { exportPageSvg } from '@brandflow/exporters/svg';
import JSZip from 'jszip';
import {
  AssetPicker,
  DesignCanvas,
  DesignCanvasPlaceholder,
  DesignPageTabs,
  DesignStudioAssetToolbar,
  findElement,
  IconSwapPanel,
  insertImageOnPage,
  LayersPanel,
  PropertyInspector,
  replaceIconWithName,
  replaceImageWithAsset,
  ValidationPanel,
  AiEditPanel,
  RevisionHistoryPanel,
  ReviewCommentsPanel,
} from '../components/design-studio';
import type { AssetPick } from '../components/design-studio';
import { clientApi, getAccessToken, getActiveClientId } from '../lib/api';
import { buildRecipeDocument } from '../lib/buildRecipeDocument';
import { RECIPES, HEADLINE_TREATMENTS, MOTIFS } from '@brandflow/layout-recipes';
import type {
  HeadlineTreatment,
  LayoutRecipe,
  Motif,
  RecipeFill,
  SlotValue,
} from '@brandflow/layout-recipes';
const DEFAULT_BRAND = {
  primary: '#1a3c8f',
  secondary: '#4a6fd4',
  accent: '#e8b23a',
  neutral: '#8a8f98',
  background: '#ffffff',
  text: '#101418',
};

// Real brand typography from Google Fonts (free, no key) grouped for the
// picker, plus web-safe system fonts that need no network load. Selected
// families are loaded live so the preview renders in the actual typeface.
const FONT_CATEGORY_LABELS: Record<string, string> = {
  'sans-serif': 'Sans-serif',
  serif: 'Serif',
  display: 'Display',
  monospace: 'Monospace',
};
const FONT_GROUPS: { label: string; families: string[] }[] = [
  { label: 'System (no load)', families: WEB_SAFE_FONTS },
  ...Object.keys(FONT_CATEGORY_LABELS).map((cat) => ({
    label: FONT_CATEGORY_LABELS[cat]!,
    families: GOOGLE_FONTS.filter((f) => f.category === cat).map((f) => f.family),
  })),
];
const DEFAULT_FONTS = { heading: 'Poppins', body: 'Inter' };

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

/** The idea a design is being created for — carried whole, not just the title. */
interface LinkedIdea {
  id?: string;
  title: string;
  angle?: string | null;
  objective?: string;
}

/** A drafted post whose copy populates the design slots. */
interface DraftPackage {
  id: string;
  ideaId: string | null;
  internalTitle: string;
  status?: string;
  objective?: string;
  hookOptions: string[] | null;
  cta: string | null;
  suggestedVisualFormat: string | null;
  onImageText: { headline: string; support?: string; badge?: string } | null;
  slideTexts: { title: string; body: string; iconName?: string }[] | null;
  visualDirection?: VisualDirection | null;
}

/** Populate every matching slot from the draft's copy — the design shows
 *  the real post content, not sample text. */
function fillFromDraft(recipe: LayoutRecipe, pkg: DraftPackage): RecipeFill {
  const slots = { ...defaultFill(recipe).slots };
  const oit = pkg.onImageText;
  for (const slot of recipe.slots) {
    if (slot.kind === 'text') {
      const id = slot.id.toLowerCase();
      let v: string | undefined;
      if (id.includes('headline') || id.includes('hook') || id.includes('quote') || id.includes('statlabel'))
        v = oit?.headline ?? pkg.internalTitle;
      else if (id.includes('support') || id.includes('context') || id.includes('subline')) v = oit?.support;
      else if (id.includes('kicker')) v = oit?.badge ?? pkg.objective?.replaceAll('_', ' ');
      else if (id.includes('badge')) v = oit?.badge;
      else if (id.includes('cta')) v = pkg.cta ?? undefined;
      if (v) slots[slot.id] = { kind: 'text', text: v.slice(0, slot.maxChars) };
    } else if (slot.kind === 'list' && pkg.slideTexts?.length) {
      slots[slot.id] = {
        kind: 'list',
        items: pkg.slideTexts.map((s) => ({ title: s.title, text: s.body, iconName: s.iconName })),
      };
    }
  }
  return { slots };
}

/** Everything needed to restore the playground controls from a saved draft. */
interface PlaygroundSource {
  recipeId: string;
  variant: string;
  treatment: HeadlineTreatment;
  motif: Motif;
  brand: typeof DEFAULT_BRAND;
  fill: RecipeFill;
  bestPractices?: boolean;
  idea?: LinkedIdea | null;
  fonts?: typeof DEFAULT_FONTS;
  /**
   * Mode shared with the server (packages/design-schema PlaygroundMode):
   * 'recipe' = slots regenerate layout; 'freeform' = the saved internalDoc IS
   * the design (AI-composed); 'hybrid' = a recipe doc with manual geometry
   * (set by the Design Studio canvas on first manual move).
   */
  mode?: PlaygroundMode;
}

/** Put the idea's title into the recipe's primary required text slot. */
function applyIdeaTitle(recipe: LayoutRecipe, fill: RecipeFill, title: string): RecipeFill {
  const primary = recipe.slots.find((s) => s.kind === 'text' && s.required);
  if (!primary) return fill;
  return {
    slots: { ...fill.slots, [primary.id]: { kind: 'text', text: title.slice(0, primary.maxChars) } },
  };
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
  const [fonts, setFonts] = useState(DEFAULT_FONTS);
  const [fill, setFill] = useState<RecipeFill>(() => defaultFill(RECIPES[0]!));
  const [treatment, setTreatment] = useState<HeadlineTreatment>('plain');
  const [motif, setMotif] = useState<Motif>('none');
  const [bestPractices, setBestPractices] = useState(true);
  const [saveState, setSaveState] = useState<string | null>(null);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  // The linked PostPackage id — kept across reopen so a resave stays linked
  // even when the draft has no idea (arrived directly via ?package=).
  const [linkedPackageId, setLinkedPackageId] = useState<string | null>(null);
  /** Authoritative DesignDocument id for AI patch (materialised on package-linked save). */
  const [linkedDesignDocumentId, setLinkedDesignDocumentId] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  // AI-composed mode: the AI invents the full layout; recipes step aside
  const [composedDoc, setComposedDoc] = useState<InternalDesignDocument | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeBrief, setComposeBrief] = useState('');
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  // Arriving from the content manager (?idea=<id>): the WHOLE idea is loaded
  // and linked — it becomes the design's primary text, is remembered across
  // recipe changes and Surprise me, and travels with saved drafts.
  const [idea, setIdea] = useState<LinkedIdea | null>(null);
  const [draftPkg, setDraftPkg] = useState<DraftPackage | null>(null);
  const [ideaPopup, setIdeaPopup] = useState(false);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editedDoc, setEditedDoc] = useState<InternalDesignDocument | null>(null);
  const [saveTrigger, setSaveTrigger] = useState(0);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetPickerTitle, setAssetPickerTitle] = useState('Pick asset');
  const [assetPickerMode, setAssetPickerMode] = useState<'image' | 'icon'>('image');
  const [replaceImageId, setReplaceImageId] = useState<string | null>(null);
  const [pendingInsert, setPendingInsert] = useState<AssetPick | null>(null);
  const [insertMode, setInsertMode] = useState(false);
  const [commentHighlightId, setCommentHighlightId] = useState<string | null>(null);
  const navigate = useNavigate();
  const ideaTitle = idea?.title ?? null;

  useEffect(() => {
    const ideaId = searchParams.get('idea');
    const packageId = searchParams.get('package');
    const titleOnly = searchParams.get('ideaTitle'); // legacy links
    if (packageId && getAccessToken()) {
      // designing a DRAFT: preselect the suggested format and fill every
      // slot with the AI-written copy
      clientApi<DraftPackage>(`/post-packages/${packageId}`).then((pkg) => {
        setDraftPkg(pkg);
        setLinkedPackageId(pkg.id);
        setIdea({
          id: pkg.ideaId ?? undefined,
          title: pkg.internalTitle,
          angle: pkg.hookOptions?.[0],
          objective: pkg.objective,
        });
        const fmt = pkg.suggestedVisualFormat;
        const r = (fmt && RECIPES.find((x) => (x.formats as string[]).includes(fmt))) || recipe;
        setRecipeId(r.id);
        setVariant(r.variants[0]!.id);
        setFill(fillFromDraft(r, pkg));
      }).catch(() => setSaveState('Could not load the draft'));
    } else if (ideaId && getAccessToken()) {
      clientApi<LinkedIdea>(`/ideas/${ideaId}`).then((full) => {
        setIdea(full);
        setFill((f) => applyIdeaTitle(recipe, f, full.title));
      }).catch(() => setSaveState('Could not load the linked idea'));
    } else if (titleOnly) {
      setIdea({ title: titleOnly });
      setFill((f) => applyIdeaTitle(recipe, f, titleOnly));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Reopen a saved draft from the design library (?draft=id)
  useEffect(() => {
    const draftId = searchParams.get('draft');
    if (!draftId || !getAccessToken()) return;
    clientApi<{
      id: string;
      name: string;
      internalDoc: unknown;
      playgroundSource: PlaygroundSource | null;
      postPackageId: string | null;
      designDocument: { id: string } | null;
    }>(
      `/design-drafts/${draftId}`,
    ).then((draft) => {
      if (draft.postPackageId) setLinkedPackageId(draft.postPackageId);
      if (draft.designDocument?.id) setLinkedDesignDocumentId(draft.designDocument.id);
      const src = draft.playgroundSource;
      if (!src) return;
      setRecipeId(src.recipeId);
      setVariant(src.variant);
      setTreatment(src.treatment);
      setMotif(src.motif);
      setBrand(src.brand);
      setFill(src.fill);
      setBestPractices(src.bestPractices ?? true);
      if (src.fonts) setFonts(src.fonts);
      if (src.idea) setIdea(src.idea); // the saved design stays linked to its idea
      // an AI-composed design reopens as the exact saved document
      if (src.mode === 'freeform') {
        try { setComposedDoc(parseDesignDocument(draft.internalDoc)); } catch { /* fall back to recipe view */ }
      }
      setSavedDraftId(draft.id ?? null);
    }).catch(() => setSaveState('Could not load draft'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const activeVariant = recipe.variants.some((v) => v.id === variant)
    ? variant
    : recipe.variants[0]!.id;

  const result = useMemo(
    () =>
      buildRecipeDocument({
        recipe,
        activeVariant,
        brand,
        fonts,
        fill,
        treatment,
        motif,
        bestPractices,
        composedDoc,
      }),
    [recipe, activeVariant, brand, fonts, fill, treatment, motif, bestPractices, composedDoc],
  );

  useEffect(() => {
    setEditedDoc(null);
    setSelectedIds([]);
  }, [recipeId, activeVariant, fill, treatment, motif, composedDoc]);

  const displayDoc = editedDoc ?? result.doc;
  const pages = displayDoc?.pages ?? [];
  const resolvedActivePageId =
    activePageId && pages.some((p) => p.id === activePageId)
      ? activePageId
      : pages[0]?.id ?? null;
  const activePageIndex = resolvedActivePageId
    ? pages.findIndex((p) => p.id === resolvedActivePageId)
    : 0;
  const activeSvg = activePageIndex >= 0 ? result.svgs[activePageIndex] ?? null : null;
  const canDirectEdit = Boolean(getAccessToken() && getActiveClientId());

  const studioBindings = displayDoc
    ? {
        document: displayDoc,
        activePageId: resolvedActivePageId,
        selectedIds,
        onDocumentChange: (doc: InternalDesignDocument) => setEditedDoc(doc),
        onSelectionChange: setSelectedIds,
      }
    : null;

  const selectedElement =
    displayDoc && selectedIds.length === 1 && selectedIds[0]
      ? findElement(displayDoc, selectedIds[0])
      : null;

  function handleAssetPick(pick: AssetPick) {
    if (replaceImageId && displayDoc) {
      setEditedDoc(replaceImageWithAsset(displayDoc, replaceImageId, pick));
      setReplaceImageId(null);
      return;
    }
    setPendingInsert(pick);
    setInsertMode(true);
  }

  function handleCanvasPageClick(pageX: number, pageY: number) {
    if (!insertMode || !pendingInsert || !displayDoc || !resolvedActivePageId) return;
    setEditedDoc(insertImageOnPage(displayDoc, resolvedActivePageId, pendingInsert, pageX, pageY));
    setInsertMode(false);
    setPendingInsert(null);
  }

  // Load the selected Google Fonts
  // typeface (the same @import the exported SVG embeds). No key, no cost;
  // web-safe fonts produce no URL and skip the network entirely.
  useEffect(() => {
    const url = googleFontsCssUrl([fonts.heading, fonts.body]);
    if (!url) return;
    const id = 'brandflow-google-fonts';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.href !== url) link.href = url;
  }, [fonts.heading, fonts.body]);

  /** Builds a rich brief from whatever content is linked. */
  function defaultBrief(): string {
    if (draftPkg) {
      const parts = [
        `Post: ${draftPkg.internalTitle}`,
        draftPkg.onImageText?.headline && `On-image headline: ${draftPkg.onImageText.headline}`,
        draftPkg.onImageText?.support && `Support line: ${draftPkg.onImageText.support}`,
        draftPkg.hookOptions?.[0] && `Hook: ${draftPkg.hookOptions[0]}`,
        draftPkg.slideTexts?.length &&
          `Slides:\n${draftPkg.slideTexts.map((s, i) => `${i + 1}. ${s.title} — ${s.body}`).join('\n')}`,
        draftPkg.cta && `CTA: ${draftPkg.cta}`,
      ].filter(Boolean);
      return parts.join('\n');
    }
    if (idea) return `Post idea: ${idea.title}${idea.angle ? `\nAngle: ${idea.angle}` : ''}`;
    return 'A bold LinkedIn post about doing hard things well. Surprise me with the composition.';
  }

  async function compose() {
    setComposeBusy(true);
    setComposeError(null);
    try {
      const res = await clientApi<{ document: InternalDesignDocument; provider: string }>(
        '/compose-sync',
        {
          method: 'POST',
          body: JSON.stringify({
            brief: composeBrief,
            format: draftPkg?.suggestedVisualFormat ?? undefined,
            visualDirection: draftPkg?.visualDirection ?? undefined,
            brandTokens: { colours: brand, fonts },
            contrastMode: bestPractices ? 'enforce' : 'warn',
          }),
        },
      );
      setComposedDoc(parseDesignDocument(res.document));
      setComposeOpen(false);
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : String(e));
    } finally {
      setComposeBusy(false);
    }
  }

  async function saveDraft() {
    if (!displayDoc) return;
    setSaveTrigger((n) => n + 1);
    if (!getAccessToken() || !getActiveClientId()) {
      setSaveState('Sign in and select a client to save drafts');
      return;
    }
    const name = window.prompt(
      'Draft name',
      idea?.title ?? `${recipe.name} — ${new Date().toLocaleDateString()}`,
    );
    if (!name) return;
    setSaveState('Saving…');
    try {
      const source: PlaygroundSource = {
        recipeId, variant: activeVariant, treatment, motif, brand, fonts, fill, bestPractices, idea,
        mode: composedDoc ? 'freeform' : editedDoc ? 'hybrid' : 'recipe',
      };
      const saved = await clientApi<{ id: string }>('/design-drafts', {
        method: 'POST',
        body: JSON.stringify({
          name,
          internalDoc: displayDoc,
          playgroundSource: source,
          ideaId: idea?.id, // one design per idea — resaving updates it
          // Link to the drafted post so the save materialises the authoritative
          // DesignDocument (Gate 3 gates approval on its validation report).
          postPackageId: draftPkg?.id ?? linkedPackageId ?? undefined,
        }),
      });
      setSavedDraftId(saved.id);
      if (draftPkg?.id ?? linkedPackageId) {
        try {
          const hydrated = await clientApi<{ designDocument: { id: string } | null }>(
            `/design-drafts/${saved.id}`,
          );
          if (hydrated.designDocument?.id) setLinkedDesignDocumentId(hydrated.designDocument.id);
        } catch {
          /* AI edit unlock is best-effort */
        }
      }

      // Saving the design advances the pipeline: the draft moves from
      // Drafts to Review & planned (no save = it stays a draft).
      if (draftPkg && ['DRAFTING', 'GENERATED', 'NEEDS_CHANGES'].includes(draftPkg.status ?? '')) {
        try {
          await clientApi(`/post-packages/${draftPkg.id}/status`, {
            method: 'POST',
            body: JSON.stringify({ status: 'IN_REVIEW' }),
          });
          setDraftPkg({ ...draftPkg, status: 'IN_REVIEW' });
          setSaveState(`Design saved — "${(idea?.title ?? name).slice(0, 36)}…" moved to Review & planned ✓`);
          return;
        } catch {
          /* status move is best-effort; the save itself succeeded */
        }
      }
      setSaveState(
        idea?.id ? `Saved to idea "${idea.title.slice(0, 40)}" ✓` : `Saved "${name}" to the design library ✓`,
      );
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
    if (!displayDoc) return;
    downloadBlob(await exportPptxBlob(displayDoc), `${recipe.id}.pptx`);
  }

  async function downloadSvgs() {
    if (!displayDoc) return;
    const svgs = displayDoc.pages.map((_, i) => exportPageSvg(displayDoc, i));
    if (svgs.length === 1) {
      downloadBlob(new Blob([svgs[0]!], { type: 'image/svg+xml' }), `${recipe.id}.svg`);
      return;
    }
    const zip = new JSZip();
    svgs.forEach((svg, i) => zip.file(`${recipe.id}-slide-${i + 1}.svg`, svg));
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `${recipe.id}-svgs.zip`);
  }

  function surprise() {
    // stay within the draft's suggested format family when one is linked
    const pool = draftPkg?.suggestedVisualFormat
      ? RECIPES.filter((x) => (x.formats as string[]).includes(draftPkg.suggestedVisualFormat!))
      : RECIPES;
    const r = (pool.length ? pool : RECIPES)[Math.floor(Math.random() * (pool.length || RECIPES.length))]!;
    setRecipeId(r.id);
    setVariant(r.variants[Math.floor(Math.random() * r.variants.length)]!.id);
    // surprise changes the LOOK, never the linked content
    setFill(contentFillFor(r));
    setTreatment(HEADLINE_TREATMENTS[Math.floor(Math.random() * HEADLINE_TREATMENTS.length)]!);
    setMotif(MOTIFS[Math.floor(Math.random() * MOTIFS.length)]!);
  }

  /** Content survives layout changes: draft copy first, then idea title, then samples. */
  function contentFillFor(r: LayoutRecipe): RecipeFill {
    if (draftPkg) return fillFromDraft(r, draftPkg);
    if (ideaTitle) return applyIdeaTitle(r, defaultFill(r), ideaTitle);
    return defaultFill(r);
  }

  function selectRecipe(id: string) {
    const r = RECIPES.find((x) => x.id === id)!;
    setRecipeId(id);
    setVariant(r.variants[0]!.id);
    setFill(contentFillFor(r));
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
      <div className="w-96 shrink-0 space-y-4 overflow-auto border-r border-slate-200 bg-white p-5">
        <h1 className="text-lg font-bold">Design Studio</h1>
        <p className="text-xs text-slate-500">
          Generate from recipes or AI compose, then refine on the canvas. Recipes need no backend;
          save, compose, and direct edit require sign-in.
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
          <legend className="px-1 text-xs font-semibold uppercase text-slate-400">Brand fonts</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['heading', 'body'] as const).map((k) => (
              <label key={k} className="text-xs">
                {k}
                <select className="mt-0.5 block w-full rounded border border-slate-300 p-1"
                  style={{ fontFamily: fontStack(fonts[k]) }}
                  value={fonts[k]}
                  onChange={(e) => setFonts((f) => ({ ...f, [k]: e.target.value }))}>
                  {FONT_GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.families.map((f) => (
                        <option key={f} value={f} style={{ fontFamily: fontStack(f) }}>{f}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>

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

        {canDirectEdit && displayDoc && (
          <AiEditPanel
            document={displayDoc}
            activePageId={resolvedActivePageId}
            selectedIds={selectedIds}
            designDocumentId={linkedDesignDocumentId}
            contrastMode={bestPractices ? 'enforce' : 'warn'}
            visualDirection={draftPkg?.visualDirection}
            onApply={(doc) => {
              setEditedDoc(doc);
              setSaveTrigger((n) => n + 1);
            }}
          />
        )}

        <ValidationPanel
          document={displayDoc}
          validationContext={{ contrastMode: bestPractices ? 'enforce' : 'warn' }}
          saveTrigger={saveTrigger}
          onSelectElement={(elementId, pageId) => {
            if (pageId) setActivePageId(pageId);
            setSelectedIds([elementId]);
          }}
        />

        {!composedDoc && recipe.slots.map((slot) => {
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

      {/* canvas column */}
      <div className="flex min-w-0 flex-1 flex-col bg-slate-100">
        <div className="shrink-0 space-y-0 overflow-auto p-4 pb-0">
        {idea && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
            <button className="flex flex-1 items-center gap-2 truncate text-left"
              title="View the linked idea" onClick={() => setIdeaPopup(true)}>
              <span className="shrink-0 font-semibold text-indigo-800">🎯 Designing idea:</span>
              <span className="truncate text-indigo-900 underline decoration-indigo-300 underline-offset-2">
                {idea.title}
              </span>
            </button>
            {savedDraftId && <span className="shrink-0 text-xs text-green-700">design saved ✓</span>}
            <button className="shrink-0 text-indigo-400 hover:text-indigo-700" title="Unlink idea"
              onClick={() => setIdea(null)}>
              ✕
            </button>
          </div>
        )}

        {composeOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-6"
            onClick={() => !composeBusy && setComposeOpen(false)}>
            <div className="w-[560px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold">✨ Compose with AI</h2>
              <p className="mt-1 text-sm text-slate-500">
                The AI art-directs the whole graphic — icon illustration scenes, charts, arrows,
                colour blocks, layered composition. Edit the brief to steer it.
              </p>
              <textarea className="mt-4 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" rows={8}
                value={composeBrief} onChange={(e) => setComposeBrief(e.target.value)} />
              {composeError && <div className="mt-2 text-sm text-red-600">{composeError}</div>}
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {composeBusy ? 'Composing — this takes 30–90 seconds…' : 'Uses your current brand colours and fonts'}
                </span>
                <div className="space-x-2">
                  <button className="rounded-md border border-slate-300 px-4 py-2 text-sm" disabled={composeBusy}
                    onClick={() => setComposeOpen(false)}>
                    Cancel
                  </button>
                  <button className="rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                    disabled={composeBusy || !composeBrief.trim()} onClick={compose}>
                    {composeBusy ? 'Composing…' : 'Compose'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {ideaPopup && idea && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-6"
            onClick={() => setIdeaPopup(false)}>
            <div className="w-[480px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Linked idea</div>
              <h2 className="mt-1 text-lg font-bold">{idea.title}</h2>
              {idea.angle && <p className="mt-2 text-sm text-slate-600">{idea.angle}</p>}
              {idea.objective && (
                <div className="mt-2 text-xs font-medium text-indigo-600">
                  {idea.objective.replaceAll('_', ' ')}
                </div>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button className="rounded-md border border-slate-300 px-4 py-2 text-sm"
                  onClick={() => setIdeaPopup(false)}>
                  Close
                </button>
                <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  onClick={() => navigate('/content')}>
                  Back to Content manager
                </button>
              </div>
            </div>
          </div>
        )}
        {composedDoc && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm">
            <span className="font-semibold text-purple-800">✨ AI-composed layout</span>
            <span className="flex-1 text-xs text-purple-500">
              recipe and variant controls are inactive; brand colours and fonts still apply live
            </span>
            <button className="rounded border border-purple-300 px-2 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100"
              onClick={() => { setComposedDoc(null); setSavedDraftId(null); }}>
              ↩ Back to recipes
            </button>
          </div>
        )}
        <div className="mb-4 flex items-center gap-2">
          <button className="rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
            title="The AI invents the entire composition — layout, scenes, charts, arrows"
            onClick={() => { setComposeBrief(defaultBrief()); setComposeError(null); setComposeOpen(true); }}>
            ✨ Compose with AI
          </button>
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
        {displayDoc?.attributions?.length ? (
          <div className="mb-4 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            <strong className="text-slate-600">Asset credits</strong> — rendered onto every exported slide:
            <div className="mt-1">{displayDoc.attributions.join(' · ')}</div>
          </div>
        ) : null}
        </div>
        {pages.length > 0 && (
          <DesignPageTabs
            pages={pages}
            activePageId={resolvedActivePageId ?? pages[0]!.id}
            onSelect={setActivePageId}
          />
        )}
        {canDirectEdit && displayDoc ? (
          <DesignCanvas
            className="min-h-0 flex-1"
            document={displayDoc}
            activePageId={resolvedActivePageId}
            selectedIds={selectedIds}
            onDocumentChange={setEditedDoc}
            onSelectionChange={setSelectedIds}
            onFirstManualEdit={() => {
              /* hybrid mode — persisted on save via playgroundSource.mode */
            }}
            insertMode={insertMode && Boolean(pendingInsert)}
            onPageClick={handleCanvasPageClick}
          />
        ) : (
          <DesignCanvasPlaceholder
            svg={activeSvg}
            pageLabel={
              pages.length > 1 && activePageIndex >= 0
                ? pages[activePageIndex]?.name || `Slide ${activePageIndex + 1}`
                : undefined
            }
            canDirectEdit={canDirectEdit}
            canvasWidth={displayDoc?.canvas.width}
            canvasHeight={displayDoc?.canvas.height}
          />
        )}
      </div>

      {canDirectEdit && studioBindings && (
        <div className="flex w-72 shrink-0 flex-col gap-4 overflow-auto border-l border-slate-200 bg-white p-4">
          <DesignStudioAssetToolbar
            {...studioBindings}
            insertMode={insertMode && Boolean(pendingInsert)}
            onInsertModeChange={(on) => {
              setInsertMode(on);
              if (!on) setPendingInsert(null);
            }}
            onInsertImage={() => {
              setReplaceImageId(null);
              setAssetPickerMode('image');
              setAssetPickerTitle('Insert image');
              setAssetPickerOpen(true);
            }}
            onReplaceImage={() => {
              const id = selectedIds[0];
              if (!id) return;
              setReplaceImageId(id);
              setAssetPickerMode('image');
              setAssetPickerTitle('Replace image');
              setAssetPickerOpen(true);
            }}
          />
          <PropertyInspector {...studioBindings} allowRawColourOverride={false} />
          {selectedElement?.type === 'icon' && (
            <IconSwapPanel
              currentName={selectedElement.iconRef.name}
              onSwap={(iconName, label) => {
                setEditedDoc(replaceIconWithName(displayDoc!, selectedElement.id, iconName, label));
              }}
            />
          )}
          <LayersPanel {...studioBindings} />
          <RevisionHistoryPanel
            designDocumentId={linkedDesignDocumentId}
            onReverted={(doc) => {
              setEditedDoc(doc);
              setSaveTrigger((n) => n + 1);
            }}
          />
          <ReviewCommentsPanel
            designDocumentId={linkedDesignDocumentId}
            selectedElementId={selectedIds[0] ?? null}
            highlightedElementId={commentHighlightId}
            onHighlightElement={setCommentHighlightId}
            onSelectElement={(id) => {
              setSelectedIds([id]);
              setCommentHighlightId(id);
            }}
          />
        </div>
      )}

      <AssetPicker
        open={assetPickerOpen}
        mode={assetPickerMode}
        title={assetPickerTitle}
        onClose={() => {
          setAssetPickerOpen(false);
          setReplaceImageId(null);
        }}
        onPick={handleAssetPick}
      />
    </div>
  );
}
