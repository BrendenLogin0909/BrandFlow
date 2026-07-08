import { describe, expect, it } from 'vitest';
import { parseDesignDocument, type InternalDesignDocument } from './schema.js';
import {
  applyDesignPatch,
  DesignPatch,
  reimposeLocked,
  patchTouchedPageIds,
  type DesignPatch as DesignPatchT,
} from './patch.js';

// ---------- fixtures ----------

let counter = 0;
function uuid(): string {
  const n = (counter++).toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${n}`;
}

const IDS = {
  doc: uuid(),
  page1: uuid(),
  page2: uuid(),
  headline: uuid(),
  logo: uuid(), // locked
  panel: uuid(),
  photo: uuid(),
  page2Text: uuid(),
};

function baseDoc(): InternalDesignDocument {
  return parseDesignDocument({
    id: IDS.doc,
    schemaVersion: 1,
    version: 3,
    brandProfileId: 'brand-1',
    clientCompanyId: 'client-1',
    layoutRecipeRef: { recipeId: 'freeform', recipeVersion: 1, variant: 'ai-composed' },
    format: 'carousel',
    canvas: { width: 1080, height: 1080, unit: 'px', dpi: 96 },
    brandTokens: {
      colours: {
        primary: '#1a3c8f',
        secondary: '#4a6fd4',
        accent: '#e8b23a',
        neutral: '#8a8f98',
        background: '#ffffff',
        text: '#101418',
      },
      fonts: { heading: 'Inter', body: 'Inter' },
      logoAssetIds: [],
    },
    pages: [
      {
        id: IDS.page1,
        name: 'Cover',
        background: { kind: 'token', token: 'background' },
        safeArea: { top: 90, right: 90, bottom: 90, left: 90 },
        elements: [
          {
            id: IDS.panel,
            type: 'shape',
            name: 'panel',
            shape: 'rect',
            frame: { x: 100, y: 100, width: 880, height: 300, rotation: 0 },
            fill: { kind: 'token', token: 'primary' },
            zIndex: 1,
          },
          {
            id: IDS.headline,
            type: 'text',
            name: 'headline',
            text: 'Original headline',
            frame: { x: 120, y: 120, width: 840, height: 120, rotation: 0 },
            fontFamily: 'Inter',
            fontSize: 48,
            fontWeight: 800,
            colour: { kind: 'token', token: 'background' },
            zIndex: 5,
            roleHint: 'headline',
          },
          {
            id: IDS.photo,
            type: 'image',
            name: 'hero photo',
            frame: { x: 120, y: 450, width: 400, height: 400, rotation: 0 },
            src: 'https://example.com/a.jpg',
            zIndex: 2,
            roleHint: 'image',
          },
          {
            id: IDS.logo,
            type: 'text',
            name: 'logo',
            text: '29FORWARD',
            frame: { x: 120, y: 900, width: 300, height: 60, rotation: 0 },
            fontFamily: 'Inter',
            fontSize: 24,
            fontWeight: 700,
            colour: { kind: 'token', token: 'text' },
            zIndex: 6,
            roleHint: 'logo',
            locked: true,
          },
        ],
      },
      {
        id: IDS.page2,
        name: 'Detail',
        background: { kind: 'token', token: 'background' },
        safeArea: { top: 90, right: 90, bottom: 90, left: 90 },
        elements: [
          {
            id: IDS.page2Text,
            type: 'text',
            name: 'body',
            text: 'Second page body',
            frame: { x: 120, y: 120, width: 840, height: 200, rotation: 0 },
            fontFamily: 'Inter',
            fontSize: 24,
            fontWeight: 400,
            colour: { kind: 'token', token: 'text' },
            zIndex: 1,
            roleHint: 'body',
          },
        ],
      },
    ],
  });
}

function patch(partial: Partial<DesignPatchT>): DesignPatchT {
  // a harmless default op keeps the schema happy for tests that only read scope
  const defaults = { patchVersion: 1, scope: 'document', operations: [{ op: 'updateOpacity', elementId: '_', opacity: 1 }] };
  return DesignPatch.parse({ ...defaults, ...partial });
}

const findEl = (doc: InternalDesignDocument, id: string) =>
  doc.pages.flatMap((p) => p.elements).find((e) => e.id === id);

// ---------- schema ----------

describe('DesignPatch schema', () => {
  it('rejects an unknown operation type', () => {
    expect(() =>
      DesignPatch.parse({
        patchVersion: 1,
        scope: 'document',
        operations: [{ op: 'nuke', elementId: 'x' }],
      }),
    ).toThrow();
  });

  it('defaults targetIds, lockedElementIds and rationale', () => {
    const p = patch({ operations: [{ op: 'updateOpacity', elementId: IDS.headline, opacity: 0.5 }] });
    expect(p.targetIds).toEqual([]);
    expect(p.lockedElementIds).toEqual([]);
    expect(p.rationale).toBe('');
  });
});

// ---------- basic operations ----------

describe('applyDesignPatch — operations', () => {
  it('updateText changes only the text content', () => {
    const base = baseDoc();
    const { document, applied, rejected } = applyDesignPatch(
      base,
      patch({ operations: [{ op: 'updateText', elementId: IDS.headline, text: 'New headline' }] }),
    );
    expect(applied).toBe(1);
    expect(rejected).toEqual([]);
    const el = findEl(document, IDS.headline);
    expect(el?.type === 'text' && el.text).toBe('New headline');
    // unrelated props untouched
    expect(el?.type === 'text' && el.fontSize).toBe(48);
  });

  it('updateFrame merges frame fields', () => {
    const base = baseDoc();
    const { document } = applyDesignPatch(
      base,
      patch({ operations: [{ op: 'updateFrame', elementId: IDS.headline, frame: { x: 200, y: 260 } }] }),
    );
    const el = findEl(document, IDS.headline)!;
    expect(el.frame.x).toBe(200);
    expect(el.frame.y).toBe(260);
    expect(el.frame.width).toBe(840); // preserved
  });

  it('updateColour writes text colour by default and shape fill when auto', () => {
    const base = baseDoc();
    const { document } = applyDesignPatch(
      base,
      patch({
        operations: [
          { op: 'updateColour', elementId: IDS.headline, colour: { kind: 'token', token: 'accent' }, on: 'auto' },
          { op: 'updateColour', elementId: IDS.panel, colour: { kind: 'token', token: 'secondary' }, on: 'auto' },
        ],
      }),
    );
    const headline = findEl(document, IDS.headline)!;
    const panel = findEl(document, IDS.panel)!;
    expect(headline.type === 'text' && headline.colour).toEqual({ kind: 'token', token: 'accent' });
    expect(panel.type === 'shape' && panel.fill).toEqual({ kind: 'token', token: 'secondary' });
  });

  it('replaceImage with imageQuery clears src and marks placeholder', () => {
    const base = baseDoc();
    const { document } = applyDesignPatch(
      base,
      patch({ operations: [{ op: 'replaceImage', elementId: IDS.photo, imageQuery: 'team celebrating' }] }),
    );
    const el = findEl(document, IDS.photo)!;
    expect(el.type === 'image' && el.src).toBeUndefined();
    expect(el.type === 'image' && el.isPlaceholder).toBe(true);
    expect(el.type === 'image' && (el.meta as { query?: string }).query).toBe('team celebrating');
  });

  it('addElement normalises and inserts a new element on the target page', () => {
    const base = baseDoc();
    const before = base.pages[0]!.elements.length;
    const { document, applied } = applyDesignPatch(
      base,
      patch({
        operations: [
          {
            op: 'addElement',
            pageId: IDS.page1,
            element: {
              type: 'icon',
              name: 'trophy',
              iconRef: { provider: 'lucide', name: 'trophy' },
              frame: { x: 600, y: 500, width: 200, height: 200 },
              colour: { kind: 'token', token: 'accent' },
            },
          },
        ],
      }),
      { newId: uuid },
    );
    expect(applied).toBe(1);
    expect(document.pages[0]!.elements.length).toBe(before + 1);
    const added = document.pages[0]!.elements.find((e) => e.type === 'icon' && e.name === 'trophy');
    expect(added).toBeTruthy();
    expect(added!.locked).toBe(false);
  });

  it('rejects an addElement that cannot be schema-normalised', () => {
    const base = baseDoc();
    const { document, applied, rejected } = applyDesignPatch(
      base,
      patch({
        operations: [{ op: 'addElement', pageId: IDS.page1, element: { type: 'text' /* missing required fields */ } }],
      }),
    );
    expect(applied).toBe(0);
    expect(rejected[0]!.reason).toBe('invalid');
    // document still valid & unchanged in element count
    expect(document.pages[0]!.elements.length).toBe(base.pages[0]!.elements.length);
  });

  it('removeElement drops the element', () => {
    const base = baseDoc();
    const { document } = applyDesignPatch(
      base,
      patch({ operations: [{ op: 'removeElement', elementId: IDS.photo }] }),
    );
    expect(findEl(document, IDS.photo)).toBeUndefined();
  });

  it('updateBackground replaces the page background', () => {
    const base = baseDoc();
    const { document } = applyDesignPatch(
      base,
      patch({
        operations: [{ op: 'updateBackground', pageId: IDS.page1, background: { kind: 'token', token: 'primary' } }],
      }),
    );
    expect(document.pages[0]!.background).toEqual({ kind: 'token', token: 'primary' });
  });

  it('type-mismatched ops are rejected, not applied', () => {
    const base = baseDoc();
    const { applied, rejected } = applyDesignPatch(
      base,
      // updateText on a shape
      patch({ operations: [{ op: 'updateText', elementId: IDS.panel, text: 'nope' }] }),
    );
    expect(applied).toBe(0);
    expect(rejected[0]!.reason).toBe('type-mismatch');
  });

  it('purity: the input document is never mutated', () => {
    const base = baseDoc();
    const snapshot = JSON.stringify(base);
    applyDesignPatch(base, patch({ operations: [{ op: 'updateText', elementId: IDS.headline, text: 'X' }] }));
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

// ---------- locked elements ----------

describe('applyDesignPatch — locked elements', () => {
  it('never modifies an element locked in the document', () => {
    const base = baseDoc();
    const lockedBefore = JSON.stringify(findEl(base, IDS.logo));
    const { document, applied, rejected } = applyDesignPatch(
      base,
      patch({ operations: [{ op: 'updateText', elementId: IDS.logo, text: 'HACKED' }] }),
    );
    expect(applied).toBe(0);
    expect(rejected[0]!.reason).toBe('locked');
    expect(JSON.stringify(findEl(document, IDS.logo))).toBe(lockedBefore);
  });

  it('honours ids passed only via lockedElementIds', () => {
    const base = baseDoc();
    const { applied, rejected } = applyDesignPatch(
      base,
      patch({
        lockedElementIds: [IDS.headline],
        operations: [{ op: 'updateText', elementId: IDS.headline, text: 'blocked' }],
      }),
    );
    expect(applied).toBe(0);
    expect(rejected[0]!.reason).toBe('locked');
  });
});

// ---------- scope ----------

describe('applyDesignPatch — scope enforcement', () => {
  it('element scope rejects ops on elements not in targetIds', () => {
    const base = baseDoc();
    const { applied, rejected } = applyDesignPatch(
      base,
      patch({
        scope: 'element',
        targetIds: [IDS.headline],
        operations: [{ op: 'updateOpacity', elementId: IDS.photo, opacity: 0.5 }],
      }),
    );
    expect(applied).toBe(0);
    expect(rejected[0]!.reason).toBe('out-of-scope');
  });

  it('page scope leaves every other page byte-identical', () => {
    const base = baseDoc();
    const otherPageBefore = JSON.stringify(base.pages[1]);
    const { document, applied } = applyDesignPatch(
      base,
      patch({
        scope: 'page',
        targetIds: [IDS.page1],
        operations: [
          { op: 'updateText', elementId: IDS.headline, text: 'Cover changed' },
          { op: 'updateBackground', pageId: IDS.page1, background: { kind: 'token', token: 'primary' } },
        ],
      }),
    );
    expect(applied).toBe(2);
    // page 2 untouched to the byte
    expect(JSON.stringify(document.pages[1])).toBe(otherPageBefore);
  });

  it('page scope rejects an op aimed at an element on a different page', () => {
    const base = baseDoc();
    const { applied, rejected } = applyDesignPatch(
      base,
      patch({
        scope: 'page',
        targetIds: [IDS.page1],
        operations: [{ op: 'updateText', elementId: IDS.page2Text, text: 'cross-page' }],
      }),
    );
    expect(applied).toBe(0);
    expect(rejected[0]!.reason).toBe('out-of-scope');
  });

  it('element scope forbids page-level background edits', () => {
    const base = baseDoc();
    const { applied, rejected } = applyDesignPatch(
      base,
      patch({
        scope: 'element',
        targetIds: [IDS.headline],
        operations: [{ op: 'updateBackground', pageId: IDS.page1, background: { kind: 'token', token: 'primary' } }],
      }),
    );
    expect(applied).toBe(0);
    expect(rejected[0]!.reason).toBe('out-of-scope');
  });
});

// ---------- result integrity ----------

describe('applyDesignPatch — result integrity', () => {
  it('applies a mix of ops and reports the rejected subset', () => {
    const base = baseDoc();
    const { document, applied, rejected } = applyDesignPatch(
      base,
      patch({
        operations: [
          { op: 'updateText', elementId: IDS.headline, text: 'Kept' }, // ok
          { op: 'updateText', elementId: IDS.logo, text: 'locked' }, // rejected: locked
          { op: 'updateOpacity', elementId: 'missing-id', opacity: 0.5 }, // rejected: not-found
        ],
      }),
    );
    expect(applied).toBe(1);
    expect(rejected.map((r) => r.reason).sort()).toEqual(['locked', 'not-found']);
    const el = findEl(document, IDS.headline)!;
    expect(el.type === 'text' && el.text).toBe('Kept');
  });

  it('returns a document that still passes parseDesignDocument', () => {
    const base = baseDoc();
    const { document } = applyDesignPatch(
      base,
      patch({ operations: [{ op: 'updateFrame', elementId: IDS.headline, frame: { width: 900 } }] }),
    );
    expect(() => parseDesignDocument(document)).not.toThrow();
  });
});

// ---------- reimposeLocked ----------

describe('reimposeLocked', () => {
  it('overwrites a drifted locked element from base', () => {
    const base = baseDoc();
    // simulate drift: forcibly edit the locked logo in a copy
    const drifted = JSON.parse(JSON.stringify(base)) as InternalDesignDocument;
    const logo = drifted.pages[0]!.elements.find((e) => e.id === IDS.logo)!;
    (logo as { text: string }).text = 'DRIFTED';
    const { document, reimposed } = reimposeLocked(base, drifted);
    expect(reimposed).toContain(IDS.logo);
    expect(JSON.stringify(findEl(document, IDS.logo))).toBe(JSON.stringify(findEl(base, IDS.logo)));
  });
});

// ---------- patchTouchedPageIds ----------

describe('patchTouchedPageIds', () => {
  it('maps element-scope targets to their owning pages', () => {
    const base = baseDoc();
    expect(patchTouchedPageIds(base, patch({ scope: 'element', targetIds: [IDS.headline] }))).toEqual([IDS.page1]);
  });
  it('returns the target pages for page scope', () => {
    const base = baseDoc();
    expect(patchTouchedPageIds(base, patch({ scope: 'page', targetIds: [IDS.page2] }))).toEqual([IDS.page2]);
  });
  it('returns all pages for document scope', () => {
    const base = baseDoc();
    expect(patchTouchedPageIds(base, patch({ scope: 'document' })).sort()).toEqual([IDS.page1, IDS.page2].sort());
  });
});
