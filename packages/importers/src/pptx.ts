/**
 * PPTX → InternalDesignDocument importer (beta).
 * Best on BrandFlow-exported decks; arbitrary PowerPoint files are best-effort.
 */
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import type {
  BrandTokensSnapshot,
  Element as DesignElement,
  InternalDesignDocument,
  Page,
} from '@brandflow/design-schema';
import { parseDesignDocument } from '@brandflow/design-schema';
import { hexToColour } from './colours.js';
import { emptyImportReport, type ImportReport } from './types.js';

type DomEl = import('@xmldom/xmldom').Element;

const DEFAULT_SAFE_AREA = { top: 90, right: 90, bottom: 90, left: 90 };

const EMU_PER_PX = 914400 / 96;

function emuToPx(emu: number): number {
  return Math.round((emu / EMU_PER_PX) * 100) / 100;
}

function textContent(el: DomEl | null): string {
  if (!el) return '';
  const texts = el.getElementsByTagName('a:t');
  return Array.from(texts)
    .map((t) => t.textContent ?? '')
    .join('')
    .trim();
}

function firstByLocalName(parent: DomEl, local: string): DomEl | null {
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const n = all.item(i)!;
    if (n.localName === local) return n as DomEl;
  }
  return null;
}

function xfrmBox(sp: DomEl): { x: number; y: number; width: number; height: number; rotation: number } {
  const xfrm = firstByLocalName(sp, 'xfrm');
  if (!xfrm) return { x: 0, y: 0, width: 100, height: 40, rotation: 0 };
  const off = firstByLocalName(xfrm, 'off');
  const ext = firstByLocalName(xfrm, 'ext');
  return {
    x: emuToPx(Number(off?.getAttribute('x') ?? 0)),
    y: emuToPx(Number(off?.getAttribute('y') ?? 0)),
    width: Math.max(emuToPx(Number(ext?.getAttribute('cx') ?? 914400)), 1),
    height: Math.max(emuToPx(Number(ext?.getAttribute('cy') ?? 914400)), 1),
    rotation: Number(xfrm.getAttribute('rot') ?? 0) / 60000,
  };
}

function solidFillHex(sp: DomEl): string | null {
  const solid = firstByLocalName(sp, 'solidFill');
  if (!solid) return null;
  const srgb = firstByLocalName(solid, 'srgbClr');
  if (srgb) {
    const val = srgb.getAttribute('val');
    return val ? `#${val}` : null;
  }
  return null;
}

export interface ImportPptxOptions {
  base?: InternalDesignDocument;
  newId?: () => string;
}

export async function importPptxBuffer(
  buffer: Buffer,
  opts: ImportPptxOptions = {},
): Promise<{ document: InternalDesignDocument; report: ImportReport }> {
  const report = emptyImportReport('pptx');
  report.beta = true;
  report.warnings.push('PPTX import is beta — complex layouts, charts and animations may lose editability.');
  const newId = opts.newId ?? randomUUID;
  const zip = await JSZip.loadAsync(buffer);

  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)/)?.[1] ?? 0);
      return na - nb;
    });

  if (!slidePaths.length) throw new Error('No slides found in PPTX');

  const base = opts.base;
  const brand: BrandTokensSnapshot = base?.brandTokens ?? {
    colours: {
      primary: '#1a3c8f', secondary: '#4a6fd4', accent: '#e8b23a',
      neutral: '#8a8f98', background: '#ffffff', text: '#101418',
    },
    fonts: { heading: 'Inter', body: 'Inter' },
    logoAssetIds: [],
  };

  const parser = new DOMParser();
  const pages: Page[] = [];

  for (let slideIdx = 0; slideIdx < slidePaths.length; slideIdx++) {
    const xml = await zip.file(slidePaths[slideIdx]!)!.async('string');
    const slideDoc = parser.parseFromString(xml, 'application/xml');
    const root = slideDoc.documentElement as DomEl;
    const elements: DesignElement[] = [];
    let z = 0;

    const shapes = Array.from(root.getElementsByTagName('*')).filter((n) => n.localName === 'sp') as DomEl[];
    for (const sp of shapes) {
      const txBody = firstByLocalName(sp, 'txBody');
      const box = xfrmBox(sp);
      const name = sp.getAttribute('name') || `Shape ${z + 1}`;

      if (txBody) {
        const text = textContent(txBody);
        if (!text || /^Credits:/i.test(text)) continue;
        report.matchedElements++;
        elements.push({
          id: newId(),
          name: name.slice(0, 120),
          type: 'text',
          text: text.slice(0, 2000),
          fontFamily: brand.fonts.body,
          fontSize: Math.max(10, Math.min(box.height * 0.35, 72)),
          fontWeight: 400,
          fontStyle: 'normal',
          lineHeight: 1.2,
          letterSpacing: 0,
          align: 'left',
          verticalAlign: 'top',
          colour: hexToColour(solidFillHex(sp) ?? '#101418', brand),
          opacity: 1,
          locked: false,
          visible: true,
          zIndex: z++,
          roleHint: null,
          tokenRefs: [],
          recipeSlotId: null,
          meta: { importedFrom: 'pptx' },
          autoFit: false,
          frame: box,
        });
        continue;
      }

      report.matchedElements++;
      elements.push({
        id: newId(),
        name: name.slice(0, 120),
        type: 'shape',
        shape: 'rect',
        fill: hexToColour(solidFillHex(sp) ?? '#4a6fd4', brand),
        strokeWidth: 0,
        cornerRadius: 0,
        opacity: 1,
        locked: false,
        visible: true,
        zIndex: z++,
        roleHint: null,
        tokenRefs: [],
        recipeSlotId: null,
        meta: { importedFrom: 'pptx' },
        frame: box,
      });
    }

    const pics = Array.from(root.getElementsByTagName('*')).filter((n) => n.localName === 'pic') as DomEl[];
    for (const pic of pics) {
      const box = xfrmBox(pic);
      report.matchedElements++;
      elements.push({
        id: newId(),
        name: (pic.getAttribute('name') ?? 'Image').slice(0, 120),
        type: 'image',
        fit: 'cover',
        cornerRadius: 0,
        borderWidth: 0,
        isPlaceholder: true,
        opacity: 1,
        locked: false,
        visible: true,
        zIndex: z++,
        roleHint: 'image',
        tokenRefs: [],
        recipeSlotId: null,
        meta: { importedFrom: 'pptx', note: 'Image bytes not embedded — re-link in studio' },
        frame: box,
      });
      report.warnings.push('PPTX image imported as placeholder — re-link asset in studio');
    }

    if (!elements.length) report.unmatchedElements++;

    pages.push({
      id: base?.pages[slideIdx]?.id ?? newId(),
      name: base?.pages[slideIdx]?.name ?? `Slide ${slideIdx + 1}`,
      background: { kind: 'token', token: 'background' },
      safeArea: base?.pages[slideIdx]?.safeArea ?? DEFAULT_SAFE_AREA,
      elements: elements.length ? elements : [{
        id: newId(),
        name: 'Empty slide',
        type: 'text',
        text: ' ',
        fontFamily: brand.fonts.body,
        fontSize: 16,
        fontWeight: 400,
        fontStyle: 'normal',
        lineHeight: 1.2,
        letterSpacing: 0,
        align: 'left',
        verticalAlign: 'top',
        colour: { kind: 'token', token: 'text' },
        opacity: 1,
        locked: false,
        visible: true,
        zIndex: 0,
        roleHint: null,
        tokenRefs: [],
        recipeSlotId: null,
        meta: { importedFrom: 'pptx', placeholder: true },
        autoFit: false,
        frame: { x: 90, y: 90, width: 400, height: 40, rotation: 0 },
      }],
    });
  }

  const canvas = base?.canvas ?? { width: 1080, height: 1080, unit: 'px' as const, dpi: 96 };
  const document = base
    ? parseDesignDocument({ ...base, pages, version: base.version + 1 })
    : parseDesignDocument({
        id: newId(),
        schemaVersion: 1,
        version: 1,
        brandProfileId: 'import',
        clientCompanyId: 'import',
        layoutRecipeRef: { recipeId: 'import', recipeVersion: 1, variant: 'pptx' },
        format: pages.length > 1 ? 'linkedin_carousel' : 'linkedin_single',
        canvas,
        brandTokens: brand,
        pages,
      });

  return { document, report };
}
