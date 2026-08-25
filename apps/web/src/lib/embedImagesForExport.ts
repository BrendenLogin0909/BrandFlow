/**
 * Make a design document PORTABLE before it goes to an exporter.
 *
 * Both exporters write `element.src` straight into the output (SVG `href`,
 * PPTX image `path`). That is fine for a `data:` URI and broken for anything
 * else:
 *   - `/api/clients/:id/assets/render/openpeeps/:slug` (bundled illustration)
 *     and `/api/clients/:id/assets/:id/content` (customer upload) are
 *     same-origin AND require the JWT, so a downloaded `.svg` opened from
 *     disk resolves nothing, and pptxgenjs (which fetches `path` itself,
 *     without our Authorization header) cannot embed them at all.
 *   - a remote CDN URL survives only while that host is up and reachable,
 *     and many block cross-origin reads.
 *
 * So: fetch every non-`data:` image once, inline it as a `data:` URI, and
 * hand the exporters a self-contained document. A fetch that fails leaves
 * the original src untouched and is reported — a partially-embedded export
 * beats no export, but the caller is told rather than silently shipping a
 * broken file.
 *
 * See docs/16-backlog.md item 4g.
 */
import type { Element, InternalDesignDocument } from '@brandflow/design-schema';
import { assetProxyUrl } from '../components/design-studio/assetTypes';

// `./api` reads localStorage at module load, so it is imported lazily inside
// the default fetcher only. That keeps everything above it — the pure
// classification and document-mapping logic — importable and unit-testable
// without a DOM.

export type ExportSrcKind =
  /** already inline — nothing to do */
  | 'inline'
  /** our own API: same-origin and needs the JWT */
  | 'api'
  /** someone else's host: fetch (via our proxy when we can) and inline */
  | 'remote';

/** Pure classification of an image src for export purposes. */
export function classifyExportSrc(src: string, origin?: string): ExportSrcKind {
  if (src.startsWith('data:')) return 'inline';
  if (src.startsWith('/api/')) return 'api';
  if (origin && src.startsWith(`${origin}/api/`)) return 'api';
  return 'remote';
}

/** Strip the origin from a same-origin API URL so the fetch stays relative. */
export function apiPathOf(src: string, origin?: string): string {
  if (src.startsWith('/')) return src;
  if (origin && src.startsWith(origin)) return src.slice(origin.length);
  try {
    const u = new URL(src);
    return u.pathname + u.search;
  } catch {
    return src;
  }
}

/** Recursively map every image element in the document (groups included). */
function mapImageSrcs(doc: InternalDesignDocument, replace: (src: string) => string | undefined): InternalDesignDocument {
  const mapElement = (el: Element): Element => {
    if (el.type === 'group') {
      return { ...el, children: el.children.map(mapElement) };
    }
    if (el.type === 'image' && el.src) {
      const next = replace(el.src);
      return next && next !== el.src ? { ...el, src: next } : el;
    }
    return el;
  };
  return {
    ...doc,
    pages: doc.pages.map((page) => ({ ...page, elements: page.elements.map(mapElement) })),
  };
}

/** Collect every distinct image src in the document (groups included). */
export function collectImageSrcs(doc: InternalDesignDocument): string[] {
  const found = new Set<string>();
  const visit = (el: Element): void => {
    if (el.type === 'group') el.children.forEach(visit);
    else if (el.type === 'image' && el.src) found.add(el.src);
  };
  doc.pages.forEach((p) => p.elements.forEach(visit));
  return [...found];
}

/** Blob → `data:` URI. FileReader handles large files without blowing the stack. */
function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image bytes'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

/** Default fetcher: authed for our API, proxied for remote hosts where possible. */
async function defaultFetchDataUri(src: string): Promise<string> {
  const { getAccessToken, getActiveClientId } = await import('./api');
  const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const kind = classifyExportSrc(src, origin);
  let url = src;
  const headers: Record<string, string> = {};

  if (kind === 'api') {
    url = apiPathOf(src, origin);
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } else {
    // Route remote hosts through our own proxy when we have a client context:
    // it sidesteps CORS, which would otherwise make the fetch unreadable.
    const clientId = getActiveClientId();
    if (clientId) {
      url = assetProxyUrl(clientId, src);
      const token = getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
  }

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return blobToDataUri(await res.blob());
}

export interface EmbedResult {
  /** Document safe to hand to an exporter. */
  doc: InternalDesignDocument;
  /** How many distinct sources were inlined. */
  embedded: number;
  /** Sources that could not be inlined; their elements keep the original src. */
  failed: string[];
}

/**
 * Inline every non-`data:` image in the document. Each distinct src is
 * fetched at most once, and all fetches run concurrently.
 */
export async function embedImagesForExport(
  doc: InternalDesignDocument,
  deps: { fetchDataUri?: (src: string) => Promise<string>; origin?: string } = {},
): Promise<EmbedResult> {
  const fetchDataUri = deps.fetchDataUri ?? defaultFetchDataUri;
  const origin = deps.origin ?? (typeof window !== 'undefined' ? window.location.origin : undefined);

  const pending = collectImageSrcs(doc).filter((src) => classifyExportSrc(src, origin) !== 'inline');
  if (pending.length === 0) return { doc, embedded: 0, failed: [] };

  const resolved = new Map<string, string>();
  const failed: string[] = [];
  await Promise.all(
    pending.map(async (src) => {
      try {
        const dataUri = await fetchDataUri(src);
        if (dataUri.startsWith('data:')) resolved.set(src, dataUri);
        else failed.push(src);
      } catch {
        failed.push(src);
      }
    }),
  );

  return {
    doc: mapImageSrcs(doc, (src) => resolved.get(src)),
    embedded: resolved.size,
    failed,
  };
}
