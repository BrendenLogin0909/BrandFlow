/**
 * SVG → InternalDesignDocument importer.
 * Optimised for BrandFlow-exported layered SVG (id + data-* attrs); general SVG is best-effort.
 */
import { randomUUID } from 'node:crypto';
import { DOMParser } from '@xmldom/xmldom';
import type {
  BrandTokensSnapshot,
  Element as DesignElement,
  InternalDesignDocument,
  Page,
  RoleHint,
  TextElement,
} from '@brandflow/design-schema';
import { parseDesignDocument } from '@brandflow/design-schema';
import { fillFromSvgPaint, hexToColour, normaliseHex } from './colours.js';
import { emptyImportReport, type ImportReport } from './types.js';

type DomEl = import('@xmldom/xmldom').Element;

const DEFAULT_SAFE_AREA = { top: 90, right: 90, bottom: 90, left: 90 };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ImportSvgOptions {
  base?: InternalDesignDocument;
  pageIndex?: number;
  newId?: () => string;
}

function parseNum(v: string | null | undefined, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseRotation(transform: string | null | undefined): number {
  if (!transform) return 0;
  const m = transform.match(/rotate\(\s*(-?\d+(?:\.\d+)?)/);
  return m ? parseNum(m[1]) : 0;
}

function parseTranslate(transform: string | null | undefined): { x: number; y: number } {
  if (!transform) return { x: 0, y: 0 };
  const m = transform.match(/translate\(\s*(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);
  return m ? { x: parseNum(m[1]), y: parseNum(m[2]) } : { x: 0, y: 0 };
}

function elId(node: DomEl, newId: () => string): string {
  const raw = node.getAttribute('id');
  return raw && UUID.test(raw) ? raw : newId();
}

function dataName(node: DomEl): string {
  return node.getAttribute('data-name') || node.getAttribute('id') || node.tagName;
}

function roleHint(node: DomEl): RoleHint | null {
  const r = node.getAttribute('data-role');
  if (!r) return null;
  const allowed = [
    'headline', 'subheadline', 'body', 'caption', 'logo', 'icon', 'badge',
    'decoration', 'background', 'cta', 'attribution', 'data', 'divider', 'image',
  ] as const;
  return (allowed as readonly string[]).includes(r) ? (r as RoleHint) : null;
}

function elementBase(node: DomEl, zIndex: number, newId: () => string) {
  return {
    id: elId(node, newId),
    name: dataName(node).slice(0, 120),
    opacity: parseNum(node.getAttribute('opacity'), 1),
    locked: false,
    visible: true,
    zIndex,
    roleHint: roleHint(node),
    tokenRefs: [] as { category: 'colour' | 'font' | 'logo' | 'spacing'; token: string }[],
    recipeSlotId: null,
    meta: {} as Record<string, unknown>,
  };
}

function textFromNode(node: DomEl, brand: BrandTokensSnapshot, zIndex: number, newId: () => string): TextElement | null {
  const tspans = Array.from(node.getElementsByTagName('tspan'));
  const lines = tspans.length
    ? tspans.map((t) => t.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    : [node.textContent?.replace(/\s+/g, ' ').trim() ?? ''];
  const text = lines.filter(Boolean).join('\n').trim();
  if (!text) return null;

  const fontSize = parseNum(node.getAttribute('font-size'), 16);
  const fontWeight = parseNum(node.getAttribute('font-weight'), 400);
  const fontStyle = node.getAttribute('font-style') === 'italic' ? 'italic' : 'normal';
  const anchor = node.getAttribute('text-anchor') ?? 'start';
  const align = anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left';
  const fill = node.getAttribute('fill') ?? '#000000';
  const x = parseNum(node.getAttribute('x'));
  const y = parseNum(node.getAttribute('y'));
  const letterSpacing = parseNum(node.getAttribute('letter-spacing'));

  let width = 400;
  let height = fontSize * 1.4 * Math.max(lines.length, 1);
  if (tspans[0]) {
    width = Math.max(width, parseNum(tspans[0].getAttribute('x')) + text.length * fontSize * 0.55);
  }

  return {
    ...elementBase(node, zIndex, newId),
    type: 'text',
    text: text.slice(0, 2000),
    fontFamily: (node.getAttribute('font-family') ?? brand.fonts.body).split(',')[0]!.replace(/['"]/g, '').trim(),
    fontSize,
    fontWeight,
    fontStyle,
    lineHeight: 1.2,
    letterSpacing,
    align,
    verticalAlign: 'top',
    colour: hexToColour(fill, brand),
    autoFit: false,
    frame: {
      x,
      y: y - fontSize,
      width: Math.max(width, 40),
      height: Math.max(height, fontSize),
      rotation: parseRotation(node.getAttribute('transform')),
    },
  };
}

function shapeFromRect(node: DomEl, brand: BrandTokensSnapshot, zIndex: number, newId: () => string): DesignElement {
  const x = parseNum(node.getAttribute('x'));
  const y = parseNum(node.getAttribute('y'));
  const width = parseNum(node.getAttribute('width'), 1);
  const height = parseNum(node.getAttribute('height'), 1);
  const fill = fillFromSvgPaint(node.getAttribute('fill'), brand);
  const stroke = node.getAttribute('stroke');
  const strokeWidth = parseNum(node.getAttribute('stroke-width'));
  return {
    ...elementBase(node, zIndex, newId),
    type: 'shape',
    shape: 'rect',
    fill,
    stroke: stroke && stroke !== 'none' ? hexToColour(stroke, brand) : undefined,
    strokeWidth,
    cornerRadius: parseNum(node.getAttribute('rx')),
    frame: { x, y, width, height, rotation: parseRotation(node.getAttribute('transform')) },
  };
}

function shapeFromEllipse(node: DomEl, brand: BrandTokensSnapshot, zIndex: number, newId: () => string): DesignElement {
  const cx = parseNum(node.getAttribute('cx'));
  const cy = parseNum(node.getAttribute('cy'));
  const rx = parseNum(node.getAttribute('rx'), 1);
  const ry = parseNum(node.getAttribute('ry'), 1);
  return {
    ...elementBase(node, zIndex, newId),
    type: 'shape',
    shape: 'ellipse',
    fill: fillFromSvgPaint(node.getAttribute('fill'), brand),
    strokeWidth: parseNum(node.getAttribute('stroke-width')),
    cornerRadius: 0,
    frame: { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2, rotation: parseRotation(node.getAttribute('transform')) },
  };
}

function imageFromNode(node: DomEl, zIndex: number, newId: () => string): DesignElement | null {
  const href = node.getAttribute('href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
  const assetId = node.getAttribute('data-asset-id') || undefined;
  const isPlaceholder = node.getAttribute('data-placeholder') === 'true';
  const x = parseNum(node.getAttribute('x'));
  const y = parseNum(node.getAttribute('y'));
  const width = parseNum(node.getAttribute('width'), 1);
  const height = parseNum(node.getAttribute('height'), 1);
  if (!href && !assetId && !isPlaceholder) return null;
  let src: string | undefined;
  if (href && /^https?:\/\//i.test(href)) src = href;
  return {
    ...elementBase(node, zIndex, newId),
    type: 'image',
    assetId,
    src,
    fit: 'cover',
    cornerRadius: 0,
    borderWidth: 0,
    isPlaceholder: isPlaceholder || !src,
    frame: { x, y, width, height, rotation: parseRotation(node.getAttribute('transform')) },
  };
}

function parseNode(
  node: DomEl,
  brand: BrandTokensSnapshot,
  zIndex: number,
  report: ImportReport,
  newId: () => string,
): DesignElement | null {
  const tag = node.tagName.toLowerCase();
  if (tag === 'defs' || tag === 'style' || node.getAttribute('id') === 'page-background' || node.getAttribute('id') === 'asset-credits')
    return null;

  if (tag === 'text') {
    report.matchedElements++;
    return textFromNode(node, brand, zIndex, newId);
  }
  if (tag === 'rect') {
    report.matchedElements++;
    return shapeFromRect(node, brand, zIndex, newId);
  }
  if (tag === 'ellipse') {
    report.matchedElements++;
    return shapeFromEllipse(node, brand, zIndex, newId);
  }
  if (tag === 'image') {
    const img = imageFromNode(node, zIndex, newId);
    if (img) report.matchedElements++;
    else report.unmatchedElements++;
    return img;
  }
  if (tag === 'g') {
    const chart = node.getAttribute('data-chart');
    const iconRef = node.getAttribute('data-icon');
    if (chart) {
      report.lostEditability.push(`Chart (${chart}) imported as grouped shapes — edit data manually`);
    }
    if (iconRef) {
      const parts = iconRef.split('/');
      const f = parseTranslate(node.getAttribute('transform'));
      report.matchedElements++;
      return {
        ...elementBase(node, zIndex, newId),
        type: 'icon',
        iconRef: { provider: (parts[0] as 'lucide') ?? 'lucide', name: parts[1] ?? 'circle' },
        colour: { kind: 'token', token: 'text' },
        strokeWidth: 2,
        frame: { x: f.x, y: f.y, width: 48, height: 48, rotation: 0 },
      };
    }
    const children: DesignElement[] = [];
    let childZ = 0;
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 1) continue;
      const el = parseNode(child as DomEl, brand, childZ++, report, newId);
      if (el) children.push(el);
    }
    if (!children.length) {
      report.unmatchedElements++;
      return null;
    }
    report.matchedElements++;
    return {
      ...elementBase(node, zIndex, newId),
      type: 'group',
      children,
      frame: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
    };
  }

  if (tag === 'path' || tag === 'polygon' || tag === 'line') {
    report.lostEditability.push(`${tag} "${dataName(node)}" kept as best-effort shape`);
    report.matchedElements++;
    const box = node.getAttribute('points') ? { x: 0, y: 0, width: 200, height: 100 } : { x: 0, y: 0, width: 100, height: 4 };
    return {
      ...elementBase(node, zIndex, newId),
      type: 'shape',
      shape: tag === 'polygon' ? 'polygon' : tag === 'line' ? 'line' : 'rect',
      fill: fillFromSvgPaint(node.getAttribute('fill') ?? node.getAttribute('stroke'), brand),
      strokeWidth: parseNum(node.getAttribute('stroke-width'), 2),
      cornerRadius: 0,
      frame: { ...box, rotation: parseRotation(node.getAttribute('transform')) },
    };
  }

  report.unmatchedElements++;
  report.warnings.push(`Skipped unsupported SVG node <${tag}>`);
  return null;
}

export function importSvgString(
  svg: string,
  opts: ImportSvgOptions = {},
): { document: InternalDesignDocument; report: ImportReport } {
  const report = emptyImportReport('svg');
  const newId = opts.newId ?? randomUUID;
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg') throw new Error('Not a valid SVG document');

  const width = parseNum(root.getAttribute('width'), parseNum(root.getAttribute('viewBox')?.split(/\s+/)[2], 1080));
  const height = parseNum(root.getAttribute('height'), parseNum(root.getAttribute('viewBox')?.split(/\s+/)[3], 1080));
  const base = opts.base;
  const brand = base?.brandTokens ?? {
    colours: {
      primary: '#1a3c8f', secondary: '#4a6fd4', accent: '#e8b23a',
      neutral: '#8a8f98', background: '#ffffff', text: '#101418',
    },
    fonts: { heading: 'Inter', body: 'Inter' },
    logoAssetIds: [],
  };

  const bgNode = doc.getElementById('page-background');
  const bgFill = bgNode?.getAttribute('fill');
  const background = bgFill
    ? hexToColour(bgFill, brand)
    : ({ kind: 'token' as const, token: 'background' });

  const elements: DesignElement[] = [];
  let z = 0;
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType !== 1) continue;
    const el = parseNode(child as DomEl, brand, z++, report, newId);
    if (el) elements.push(el);
  }

  if (!elements.length) throw new Error('No editable elements found in SVG');

  const pageIndex = opts.pageIndex ?? 0;
  const basePage = base?.pages[pageIndex];
  const page: Page = {
    id: basePage?.id ?? newId(),
    name: basePage?.name ?? 'Imported',
    background,
    safeArea: basePage?.safeArea ?? DEFAULT_SAFE_AREA,
    elements,
  };

  const merged: InternalDesignDocument = base
    ? {
        ...base,
        pages: base.pages.map((p, i) => (i === pageIndex ? page : p)),
        version: base.version + 1,
      }
    : parseDesignDocument({
        id: newId(),
        schemaVersion: 1,
        version: 1,
        brandProfileId: 'import',
        clientCompanyId: 'import',
        layoutRecipeRef: { recipeId: 'import', recipeVersion: 1, variant: 'svg' },
        format: 'linkedin_single',
        canvas: { width, height, unit: 'px', dpi: 96 },
        brandTokens: brand,
        pages: [page],
      });

  return { document: parseDesignDocument(merged), report };
}

export function importSvgBuffer(buffer: Buffer, opts?: ImportSvgOptions) {
  return importSvgString(buffer.toString('utf8'), opts);
}
