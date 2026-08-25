/**
 * Tests for the export image-embedding pass (docs/16-backlog.md item 4g).
 *
 * The bug being prevented: exporters write `element.src` verbatim, so a
 * design using a bundled illustration (/assets/render/...) or an uploaded
 * logo (/assets/:id/content) exported a URL that only resolves inside an
 * authed session — a downloaded .svg showed a broken image and pptxgenjs
 * could not embed it at all.
 */
import { describe, expect, it, vi } from 'vitest';
import type { InternalDesignDocument } from '@brandflow/design-schema';
import { apiPathOf, classifyExportSrc, collectImageSrcs, embedImagesForExport } from './embedImagesForExport';

const ORIGIN = 'http://localhost:5173';
const DATA_URI = 'data:image/png;base64,AAAA';

function imageEl(id: string, src?: string) {
  return {
    id,
    name: id,
    type: 'image' as const,
    frame: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: 1,
    roleHint: 'image' as const,
    tokenRefs: [],
    recipeSlotId: null,
    meta: {},
    fit: 'contain' as const,
    cornerRadius: 0,
    borderWidth: 0,
    isPlaceholder: false,
    ...(src ? { src } : {}),
  };
}

function docWith(elements: unknown[]): InternalDesignDocument {
  return {
    pages: [{ id: 'p1', name: 'Page 1', background: { kind: 'token', token: 'background' }, elements }],
  } as unknown as InternalDesignDocument;
}

describe('classifyExportSrc', () => {
  it.each([
    ['data:image/svg+xml;utf8,%3Csvg%2F%3E', 'inline'],
    ['/api/clients/abc/assets/render/openpeeps/peeps-team-huddle?hue=%231a3c8f', 'api'],
    ['/api/clients/abc/assets/def/content', 'api'],
    [`${ORIGIN}/api/clients/abc/assets/def/content`, 'api'],
    ['https://images.example.org/photo.jpg', 'remote'],
  ])('classifies %s as %s', (src, expected) => {
    expect(classifyExportSrc(src, ORIGIN)).toBe(expected);
  });
});

describe('apiPathOf', () => {
  it('keeps an already-relative path', () => {
    expect(apiPathOf('/api/clients/a/assets/b/content', ORIGIN)).toBe('/api/clients/a/assets/b/content');
  });
  it('strips the origin from an absolute same-origin URL, preserving the query', () => {
    expect(apiPathOf(`${ORIGIN}/api/clients/a/assets/render/undraw/x?hue=%23fff`, ORIGIN)).toBe(
      '/api/clients/a/assets/render/undraw/x?hue=%23fff',
    );
  });
});

describe('collectImageSrcs', () => {
  it('finds images nested inside groups, and ignores images with no src', () => {
    const group = {
      ...imageEl('g1'),
      type: 'group' as const,
      children: [imageEl('inner', '/api/clients/a/assets/inner/content')],
    };
    const doc = docWith([imageEl('top', 'https://example.org/a.png'), imageEl('placeholder'), group]);
    expect(collectImageSrcs(doc).sort()).toEqual(
      ['/api/clients/a/assets/inner/content', 'https://example.org/a.png'].sort(),
    );
  });
});

describe('embedImagesForExport', () => {
  it('replaces authed API srcs with inlined data URIs', async () => {
    const doc = docWith([imageEl('logo', '/api/clients/a/assets/logo/content')]);
    const fetchDataUri = vi.fn().mockResolvedValue(DATA_URI);

    const result = await embedImagesForExport(doc, { fetchDataUri, origin: ORIGIN });

    expect(result.embedded).toBe(1);
    expect(result.failed).toEqual([]);
    expect((result.doc.pages[0]!.elements[0] as { src: string }).src).toBe(DATA_URI);
  });

  it('embeds images nested in groups too', async () => {
    const group = {
      ...imageEl('g1'),
      type: 'group' as const,
      children: [imageEl('inner', '/api/clients/a/assets/inner/content')],
    };
    const result = await embedImagesForExport(docWith([group]), {
      fetchDataUri: async () => DATA_URI,
      origin: ORIGIN,
    });
    const children = (result.doc.pages[0]!.elements[0] as { children: { src: string }[] }).children;
    expect(children[0]!.src).toBe(DATA_URI);
  });

  it('fetches each distinct src only once even when reused across pages', async () => {
    const src = '/api/clients/a/assets/render/openpeeps/peeps-team-huddle';
    const doc = docWith([imageEl('a', src), imageEl('b', src)]);
    const fetchDataUri = vi.fn().mockResolvedValue(DATA_URI);

    await embedImagesForExport(doc, { fetchDataUri, origin: ORIGIN });

    expect(fetchDataUri).toHaveBeenCalledTimes(1);
  });

  it('leaves already-inline data URIs untouched and does no fetching', async () => {
    const doc = docWith([imageEl('a', DATA_URI)]);
    const fetchDataUri = vi.fn();

    const result = await embedImagesForExport(doc, { fetchDataUri, origin: ORIGIN });

    expect(fetchDataUri).not.toHaveBeenCalled();
    expect(result.embedded).toBe(0);
    expect((result.doc.pages[0]!.elements[0] as { src: string }).src).toBe(DATA_URI);
  });

  it('reports failures and keeps the original src so the export still produces a file', async () => {
    const good = '/api/clients/a/assets/good/content';
    const bad = '/api/clients/a/assets/bad/content';
    const doc = docWith([imageEl('a', good), imageEl('b', bad)]);

    const result = await embedImagesForExport(doc, {
      fetchDataUri: async (src) => {
        if (src === bad) throw new Error('404');
        return DATA_URI;
      },
      origin: ORIGIN,
    });

    expect(result.embedded).toBe(1);
    expect(result.failed).toEqual([bad]);
    expect((result.doc.pages[0]!.elements[0] as { src: string }).src).toBe(DATA_URI);
    expect((result.doc.pages[0]!.elements[1] as { src: string }).src).toBe(bad);
  });

  it('treats a non-data response as a failure rather than writing a bogus src', async () => {
    const doc = docWith([imageEl('a', '/api/clients/a/assets/x/content')]);
    const result = await embedImagesForExport(doc, {
      fetchDataUri: async () => '<html>login</html>',
      origin: ORIGIN,
    });
    expect(result.embedded).toBe(0);
    expect(result.failed).toHaveLength(1);
  });

  it('does not mutate the input document', async () => {
    const src = '/api/clients/a/assets/x/content';
    const doc = docWith([imageEl('a', src)]);
    await embedImagesForExport(doc, { fetchDataUri: async () => DATA_URI, origin: ORIGIN });
    expect((doc.pages[0]!.elements[0] as { src: string }).src).toBe(src);
  });
});
