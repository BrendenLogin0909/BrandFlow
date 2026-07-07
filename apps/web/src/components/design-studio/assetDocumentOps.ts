import type { ImageElement, InternalDesignDocument } from '@brandflow/design-schema';
import { updateElementById } from './document-mutations';
import { activePageFromBindings } from './studio-props';
import type { AssetPick } from './assetTypes';
import { attributionLine } from './assetTypes';

export function mergeAttributions(
  doc: InternalDesignDocument,
  lines: (string | null | undefined)[],
): InternalDesignDocument {
  const existing = doc.attributions ?? [];
  const merged = [...existing];
  for (const line of lines) {
    if (line && !merged.includes(line)) merged.push(line);
  }
  return merged.length ? { ...doc, attributions: merged } : { ...doc, attributions: undefined };
}

export function replaceImageWithAsset(
  doc: InternalDesignDocument,
  elementId: string,
  pick: AssetPick,
): InternalDesignDocument {
  let next = updateElementById(doc, elementId, (el) => {
    if (el.type !== 'image') return el;
    return {
      ...el,
      assetId: pick.libraryItemId,
      src: pick.contentUrl,
      isPlaceholder: false,
      name: pick.label.slice(0, 120) || el.name,
    };
  });
  const credit = attributionLine(pick);
  if (credit) next = mergeAttributions(next, [credit]);
  return next;
}

export function replaceIconWithName(
  doc: InternalDesignDocument,
  elementId: string,
  iconName: string,
  label?: string,
): InternalDesignDocument {
  return updateElementById(doc, elementId, (el) => {
    if (el.type !== 'icon') return el;
    return {
      ...el,
      name: label?.slice(0, 120) || iconName,
      iconRef: { provider: 'lucide', name: iconName },
    };
  });
}

export function insertImageOnPage(
  doc: InternalDesignDocument,
  pageId: string,
  pick: AssetPick,
  pageX: number,
  pageY: number,
  size = { width: 320, height: 240 },
): InternalDesignDocument {
  const pageIdx = doc.pages.findIndex((p) => p.id === pageId);
  if (pageIdx < 0) return doc;
  const page = doc.pages[pageIdx]!;
  const maxZ = Math.max(0, ...page.elements.map((e) => e.zIndex));

  const image: ImageElement = {
    id: crypto.randomUUID(),
    name: pick.label.slice(0, 120) || 'Image',
    type: 'image',
    frame: {
      x: Math.max(0, pageX - size.width / 2),
      y: Math.max(0, pageY - size.height / 2),
      width: size.width,
      height: size.height,
      rotation: 0,
    },
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: maxZ + 1,
    roleHint: 'image',
    tokenRefs: [],
    recipeSlotId: null,
    meta: { manualInsert: true },
    assetId: pick.libraryItemId,
    src: pick.contentUrl,
    fit: 'cover',
    cornerRadius: 0,
    borderWidth: 0,
    isPlaceholder: false,
  };

  const pages = doc.pages.map((p, i) =>
    i === pageIdx ? { ...p, elements: [...p.elements, image] } : p,
  );
  let next: InternalDesignDocument = { ...doc, pages };
  const credit = attributionLine(pick);
  if (credit) next = mergeAttributions(next, [credit]);
  return next;
}

export function pageIdFromBindings(
  doc: InternalDesignDocument,
  activePageId: string | null,
): string | null {
  return activePageFromBindings({ document: doc, activePageId })?.id ?? null;
}
