/**
 * PolotnoAdapter — converts the authoritative InternalDesignDocument to/from
 * Polotno scene JSON. Round-trip contract (tested): ids, locks, geometry
 * (±0.5px), text, tokenRefs and z-order are preserved. Internal ids/tokens
 * ride in Polotno's `custom` field.
 */
import { randomUUID } from 'node:crypto';
import type {
  Colour,
  Element,
  Fill,
  InternalDesignDocument,
  ValidationReport,
} from '@brandflow/design-schema';
import { parseDesignDocument, resolveColour, validateDesignDocument } from '@brandflow/design-schema';
import type { DesignEnginePort } from '../ports/index.js';

type PolotnoElement = Record<string, unknown>;

export class PolotnoAdapter implements DesignEnginePort {
  toEngineFormat(doc: InternalDesignDocument): unknown {
    return {
      width: doc.canvas.width,
      height: doc.canvas.height,
      unit: 'px',
      dpi: doc.canvas.dpi,
      custom: { brandflow: { documentId: doc.id, recipeRef: doc.layoutRecipeRef } },
      pages: doc.pages.map((page) => ({
        id: page.id,
        custom: { safeArea: page.safeArea },
        background: this.fillToPolotno(page.background, doc),
        children: [...page.elements]
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((el) => this.elementToPolotno(el, doc)),
      })),
    };
  }

  fromEngineFormat(engineDoc: unknown, base: InternalDesignDocument): InternalDesignDocument {
    const scene = engineDoc as { pages: { id: string; children: PolotnoElement[] }[] };
    const doc: InternalDesignDocument = {
      ...base,
      version: base.version + 1,
      pages: scene.pages.map((p) => {
        const basePage = base.pages.find((bp) => bp.id === p.id);
        return {
          id: p.id,
          name: basePage?.name ?? 'Page',
          background: basePage?.background ?? { kind: 'token', token: 'background' },
          safeArea: basePage?.safeArea ?? { top: 80, right: 80, bottom: 80, left: 80 },
          elements: p.children.map((c, i) => this.elementFromPolotno(c, i, base)),
        };
      }),
    };
    return parseDesignDocument(doc); // never trust editor output blindly
  }

  validate(doc: InternalDesignDocument): ValidationReport {
    return validateDesignDocument(doc);
  }

  duplicate(doc: InternalDesignDocument, newId: string): InternalDesignDocument {
    return { ...structuredClone(doc), id: newId, version: 1 };
  }

  applyBrandTokens(
    doc: InternalDesignDocument,
    tokens: InternalDesignDocument['brandTokens'],
  ): InternalDesignDocument {
    // Token-referenced colours re-resolve automatically; only the snapshot changes.
    return { ...structuredClone(doc), brandTokens: tokens };
  }

  // ---------- element mapping ----------

  private elementToPolotno(el: Element, doc: InternalDesignDocument): PolotnoElement {
    const common = {
      id: el.id,
      name: el.name,
      x: el.frame.x,
      y: el.frame.y,
      width: el.frame.width,
      height: el.frame.height,
      rotation: el.frame.rotation,
      opacity: el.opacity,
      visible: el.visible,
      draggable: !el.locked,
      selectable: true,
      locked: el.locked,
      custom: {
        brandflow: {
          roleHint: el.roleHint,
          tokenRefs: el.tokenRefs,
          recipeSlotId: el.recipeSlotId,
          zIndex: el.zIndex,
          meta: el.meta,
        },
      },
    };

    switch (el.type) {
      case 'text':
        return {
          ...common,
          type: 'text',
          text: el.text,
          fontFamily: el.fontFamily,
          fontSize: el.fontSize,
          fontWeight: String(el.fontWeight),
          fontStyle: el.fontStyle,
          lineHeight: el.lineHeight,
          letterSpacing: el.letterSpacing,
          align: el.align,
          verticalAlign: el.verticalAlign,
          fill: this.colourToHex(el.colour, doc),
        };
      case 'image':
        return { ...common, type: 'image', src: el.src ?? '', cropX: el.cropRect?.x ?? 0, cropY: el.cropRect?.y ?? 0, cornerRadius: el.cornerRadius, custom: { ...common.custom, assetId: el.assetId, isPlaceholder: el.isPlaceholder } };
      case 'icon':
        return { ...common, type: 'svg', src: el.iconRef.svg ?? `icon://${el.iconRef.provider}/${el.iconRef.name}`, keepRatio: true, custom: { ...common.custom, iconRef: el.iconRef }, colorsReplace: { '#000000': this.colourToHex(el.colour, doc) } };
      case 'shape':
        return { ...common, type: 'figure', subType: el.shape, fill: this.fillToPolotno(el.fill, doc), stroke: el.stroke ? this.colourToHex(el.stroke, doc) : undefined, strokeWidth: el.strokeWidth, cornerRadius: el.cornerRadius };
      case 'chart':
        return { ...common, type: 'group', custom: { ...common.custom, chart: { chartType: el.chartType, data: el.data, palette: el.palette } }, children: [] };
      case 'group':
        return { ...common, type: 'group', children: el.children.map((c) => this.elementToPolotno(c, doc)) };
    }
  }

  private elementFromPolotno(pe: PolotnoElement, index: number, base: InternalDesignDocument): Element {
    const custom = (pe.custom as { brandflow?: Record<string, unknown> })?.brandflow ?? {};
    const baseEl = findElement(base, pe.id as string);

    const common = {
      id: (pe.id as string) ?? randomUUID(),
      name: (pe.name as string) || baseEl?.name || 'element',
      frame: {
        x: pe.x as number,
        y: pe.y as number,
        width: pe.width as number,
        height: pe.height as number,
        rotation: (pe.rotation as number) ?? 0,
      },
      opacity: (pe.opacity as number) ?? 1,
      locked: Boolean(pe.locked ?? baseEl?.locked),
      visible: (pe.visible as boolean) ?? true,
      zIndex: (custom.zIndex as number) ?? index,
      roleHint: (custom.roleHint as Element['roleHint']) ?? baseEl?.roleHint ?? null,
      tokenRefs: (custom.tokenRefs as Element['tokenRefs']) ?? baseEl?.tokenRefs ?? [],
      recipeSlotId: (custom.recipeSlotId as string | null) ?? baseEl?.recipeSlotId ?? null,
      meta: (custom.meta as Record<string, unknown>) ?? {},
    };

    switch (pe.type) {
      case 'text':
        return {
          ...common,
          type: 'text',
          text: pe.text as string,
          fontFamily: pe.fontFamily as string,
          fontSize: pe.fontSize as number,
          fontWeight: Number(pe.fontWeight ?? 400),
          fontStyle: (pe.fontStyle as 'normal' | 'italic') ?? 'normal',
          lineHeight: (pe.lineHeight as number) ?? 1.2,
          letterSpacing: (pe.letterSpacing as number) ?? 0,
          align: (pe.align as 'left' | 'center' | 'right') ?? 'left',
          verticalAlign: (pe.verticalAlign as 'top' | 'middle' | 'bottom') ?? 'top',
          colour: this.hexToColour(pe.fill as string, base),
          autoFit: false,
        };
      case 'svg': {
        const iconRef = (custom as { iconRef?: { provider: 'lucide' | 'tabler' | 'internal' | 'custom'; name: string; svg?: string } }).iconRef;
        const replaced = Object.values((pe.colorsReplace as Record<string, string>) ?? {})[0];
        return { ...common, type: 'icon', iconRef: iconRef ?? { provider: 'custom', name: 'imported', svg: pe.src as string }, colour: this.hexToColour(replaced ?? '#000000', base), strokeWidth: 2 };
      }
      case 'figure':
        return { ...common, type: 'shape', shape: (pe.subType as 'rect') ?? 'rect', fill: this.hexToColour(pe.fill as string, base), stroke: pe.stroke ? this.hexToColour(pe.stroke as string, base) : undefined, strokeWidth: (pe.strokeWidth as number) ?? 0, cornerRadius: (pe.cornerRadius as number) ?? 0 };
      case 'group': {
        const chart = (custom as { chart?: { chartType: 'bar'; data: { label: string; value: number }[]; palette: Element['tokenRefs'] } }).chart;
        if (chart) return { ...common, type: 'chart', chartType: chart.chartType, data: chart.data, palette: chart.palette };
        return { ...common, type: 'group', children: ((pe.children as PolotnoElement[]) ?? []).map((c, i) => this.elementFromPolotno(c, i, base)) };
      }
      default: // image and anything unknown maps to image (parse will reject truly unknown shapes)
        return { ...common, type: 'image', src: (pe.src as string) || undefined, assetId: (pe.custom as { assetId?: string })?.assetId, fit: 'cover', cornerRadius: (pe.cornerRadius as number) ?? 0, borderWidth: 0, isPlaceholder: false };
    }
  }

  // ---------- colour mapping ----------

  private colourToHex(colour: Colour, doc: InternalDesignDocument): string {
    return resolveColour(colour, doc) ?? '#000000';
  }

  private fillToPolotno(fill: Fill, doc: InternalDesignDocument): string {
    if ('kind' in fill && (fill.kind === 'token' || fill.kind === 'raw'))
      return this.colourToHex(fill, doc);
    if (fill.kind === 'gradient') {
      const stops = fill.stops
        .map((s) => `${this.colourToHex(s.colour, doc)} ${Math.round(s.at * 100)}%`)
        .join(', ');
      return `linear-gradient(${fill.angle}deg, ${stops})`;
    }
    return '#ffffff'; // imageFill handled via page background image in the editor shell
  }

  /** Re-tokenise hexes that exactly match a brand token; otherwise raw+override(false) so validation flags them. */
  private hexToColour(hex: string, doc: InternalDesignDocument): Colour {
    const norm = (hex ?? '#000000').toLowerCase();
    for (const [tokenName, tokenHex] of Object.entries(doc.brandTokens.colours)) {
      if (tokenHex.toLowerCase() === norm) return { kind: 'token', token: tokenName as never };
    }
    return { kind: 'raw', hex: norm, allowedOverride: false };
  }
}

function findElement(doc: InternalDesignDocument, id: string): Element | undefined {
  const walk = (els: Element[]): Element | undefined => {
    for (const el of els) {
      if (el.id === id) return el;
      if (el.type === 'group') {
        const hit = walk(el.children);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  for (const page of doc.pages) {
    const hit = walk(page.elements);
    if (hit) return hit;
  }
  return undefined;
}
