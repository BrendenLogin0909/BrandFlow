import type { ImageElement, InternalDesignDocument } from '@brandflow/design-schema';
import { getActiveClientId } from '../../lib/api';
import { updateElementById } from './document-mutations';
import { activePageFromBindings } from './studio-props';
import type { AssetPick } from './assetTypes';
import { attributionLine, isBundledSceneProvider, resolveAssetContentUrl } from './assetTypes';

const DEFAULT_ACCENT = '#4f46e5';

function imageFitForPick(pick: AssetPick): ImageElement['fit'] {
  if (pick.kind === 'illustration' || pick.contentUrl.includes('svg') || isBundledSceneProvider(pick.provider)) {
    return 'contain';
  }
  return 'cover';
}

function imageSizeForPick(pick: AssetPick): { width: number; height: number } {
  if (pick.kind === 'illustration' || isBundledSceneProvider(pick.provider)) {
    return { width: 420, height: 315 };
  }
  return { width: 320, height: 240 };
}

function applyPickToImage(el: ImageElement, pick: AssetPick, accentHue = DEFAULT_ACCENT): ImageElement {
  const clientId = getActiveClientId();
  const src = resolveAssetContentUrl(pick, clientId, accentHue);
  return {
    ...el,
    assetId: pick.libraryItemId,
    src,
    isPlaceholder: false,
    name: pick.label.slice(0, 120) || el.name,
    fit: imageFitForPick(pick),
    meta: {
      ...el.meta,
      assetProvider: pick.provider,
      assetProviderId: pick.providerId,
      assetAccent: isBundledSceneProvider(pick.provider) ? accentHue : undefined,
      manualInsert: true,
    },
  };
}

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
  accentHue = DEFAULT_ACCENT,
): InternalDesignDocument {
  let next = updateElementById(doc, elementId, (el) => {
    if (el.type !== 'image') return el;
    return applyPickToImage(el, pick, accentHue);
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
  size?: { width: number; height: number },
  accentHue = DEFAULT_ACCENT,
): InternalDesignDocument {
  const pageIdx = doc.pages.findIndex((p) => p.id === pageId);
  if (pageIdx < 0) return doc;
  const page = doc.pages[pageIdx]!;
  const maxZ = Math.max(0, ...page.elements.map((e) => e.zIndex));
  const dims = size ?? imageSizeForPick(pick);
  const clientId = getActiveClientId();
  const src = resolveAssetContentUrl(pick, clientId, accentHue);

  const image: ImageElement = {
    id: crypto.randomUUID(),
    name: pick.label.slice(0, 120) || 'Image',
    type: 'image',
    frame: {
      x: Math.max(0, Math.min(pageX - dims.width / 2, doc.canvas.width - dims.width)),
      y: Math.max(0, Math.min(pageY - dims.height / 2, doc.canvas.height - dims.height)),
      width: dims.width,
      height: dims.height,
      rotation: 0,
    },
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: maxZ + 1,
    roleHint: 'image',
    tokenRefs: [],
    recipeSlotId: null,
    meta: {
      manualInsert: true,
      assetProvider: pick.provider,
      assetProviderId: pick.providerId,
      assetAccent: isBundledSceneProvider(pick.provider) ? accentHue : undefined,
    },
    assetId: pick.libraryItemId,
    src,
    fit: imageFitForPick(pick),
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

export function lastInsertedImageId(doc: InternalDesignDocument, pageId: string): string | null {
  const page = doc.pages.find((p) => p.id === pageId);
  return page?.elements.filter((e) => e.type === 'image').at(-1)?.id ?? null;
}

export function updateBundledImageAccent(
  doc: InternalDesignDocument,
  elementId: string,
  accentHex: string,
): InternalDesignDocument {
  return updateElementById(doc, elementId, (el) => {
    if (el.type !== 'image') return el;
    const provider = el.meta?.assetProvider as string | undefined;
    const providerId = el.meta?.assetProviderId as string | undefined;
    if (!isBundledSceneProvider(provider) || !providerId) return el;
    const clientId = getActiveClientId();
    if (!clientId) return el;
    return {
      ...el,
      src: resolveAssetContentUrl(
        {
          contentUrl: el.src ?? '',
          label: el.name,
          provider,
          providerId,
          attributionRequired: false,
          kind: 'illustration',
          usageTier: 1,
        },
        clientId,
        accentHex,
      ),
      meta: { ...el.meta, assetAccent: accentHex },
    };
  });
}

export function pageIdFromBindings(
  doc: InternalDesignDocument,
  activePageId: string | null,
): string | null {
  return activePageFromBindings({ document: doc, activePageId })?.id ?? null;
}
