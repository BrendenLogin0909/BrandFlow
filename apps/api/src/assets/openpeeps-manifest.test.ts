import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPENPEEPS_MANIFEST } from './openpeeps-manifest.js';
import { UNDRAW_MANIFEST } from './undraw-manifest.js';
import { searchAssets } from './providers.js';
import { PROVIDERS } from './registry.js';

/** Vocabulary the AI compose prompt tells the model to use (prompts/index.ts). */
const COMPOSE_VOCABULARY = [
  'qa tester bug', 'developer coding', 'team huddle', 'person thinking',
  'person celebrating', 'person presenting', 'manager pointing', 'mentor coaching',
  'data analyst', 'diverse team', 'customer support', 'remote worker',
  'person stressed', 'two people debate',
  'growth chart', 'funnel chart', 'before after bars', 'maturity ladder',
  'process flow', 'kpi gauge', 'analytics dashboard', 'timeline milestones',
  'comparison scales', 'warning alert',
  'rocket launch', 'bright idea', 'secure shield', 'handshake deal', 'bridge gap',
  'broken chain', 'target goal', 'checklist', 'connected network', 'audience reach',
];

describe('Open Peeps character pack — structure', () => {
  it('ships 60-120 self-contained scenes', () => {
    expect(OPENPEEPS_MANIFEST.length).toBeGreaterThanOrEqual(60);
    expect(OPENPEEPS_MANIFEST.length).toBeLessThanOrEqual(120);
  });

  it('every scene is a valid, self-contained, recolourable SVG', () => {
    for (const e of OPENPEEPS_MANIFEST) {
      expect(e.slug, e.slug).toMatch(/^peep-[a-z0-9-]+$/);
      expect(e.title.length, e.slug).toBeGreaterThan(3);
      // one shared viewBox so results tile evenly with the existing pack
      expect(e.svg, e.slug).toContain('viewBox="0 0 400 300"');
      expect(e.svg.startsWith('<svg'), e.slug).toBe(true);
      expect(e.svg.endsWith('</svg>'), e.slug).toBe(true);
      // recolour contract: the render route swaps this literal for the brand hue.
      // Characters carry no accent any more, so it must come from the props.
      expect(e.svg, e.slug).toContain('#6c63ff');
      // no external references, fonts, scripts or raster payloads
      expect(e.svg, e.slug).not.toMatch(/<image|<text|<script|<foreignObject|<use\b/);
      expect(e.svg, e.slug).not.toMatch(/xlink:href|href=|url\(|@import|font-family/);
      expect(e.svg, e.slug).not.toContain('__FILL__');
      expect(e.svg, e.slug).not.toContain('__INK__');
      // placeholder colours must be fully substituted; ink is never recoloured
      expect(e.svg, e.slug).toContain('#3f3d56');
    }
  });

  it('carries real character artwork, not just props', () => {
    // Open Peeps parts are long hand-drawn paths; a props-only scene would be tiny.
    for (const e of OPENPEEPS_MANIFEST) {
      expect(e.svg.length, e.slug).toBeGreaterThan(2500);
    }
    const total = OPENPEEPS_MANIFEST.reduce((n, e) => n + e.svg.length, 0);
    // Composed at module load from a shared part table — keep an eye on drift.
    expect(total).toBeLessThan(3_000_000);
  });

  /**
   * Regression pin for the "garment-coloured hands" defect (fixed 2026-08-25).
   *
   * An Open Peeps pose is exactly two merged paths — one line-art, one covering
   * the whole interior — and that interior path holds the neck, hands, forearms
   * and ankles as well as part of the outfit. Painting it with the recolourable
   * accent (as the pack once did) gave every figure brand-coloured hands, neck,
   * wrists and ankles against a correctly skin-toned face. The interior must be
   * a SKIN tone; the brand hue has to come from the props instead.
   */
  describe('skin/accent split (regression: skin must reach necks, hands, ankles)', () => {
    const SKINS = ['#ffd9c0', '#f3b98d', '#d69963', '#a86b3c', '#7a4a24'] as const;
    /** Accent regions that actually read as brand colour (opaque, or >= 0.3). */
    const strongAccents = (svg: string) =>
      [...svg.matchAll(/#6c63ff(?:"\s+opacity="([0-9.]+)")?/g)].filter(
        (m) => m[1] === undefined || Number(m[1]) >= 0.3,
      ).length;

    it('paints every scene with at least one fixed skin tone', () => {
      for (const e of OPENPEEPS_MANIFEST) {
        expect(SKINS.some((s) => e.svg.includes(s)), e.slug).toBe(true);
      }
    });

    it('keeps at least one clearly visible accent prop region per scene', () => {
      // Figures no longer carry the brand hue, so a scene whose only accent is a
      // faint background wash would show almost no brand colour at all.
      for (const e of OPENPEEPS_MANIFEST) {
        expect(strongAccents(e.svg), e.slug).toBeGreaterThanOrEqual(1);
      }
    });

    it('never casts a pose whose garment sits in the recolourable fill path', () => {
      // These parts put the TOP in the fill region: with fill = skin they render
      // a flesh-coloured shirt and arms that melt into the torso.
      const UNUSABLE = [
        'BlazerPantsBW', 'BlazerPantsWB', 'CrossedArmsWB', 'EasingBW', 'EasingWB',
        'PointingFingerWB', 'ShirtPantsWB', 'RoboDanceWB', 'ClosedLegWB',
        'CrossedLegs', 'OneLegUpWB',
      ];
      const src = readFileSync(new URL('./openpeeps-manifest.ts', import.meta.url), 'utf8');
      const castTable = src.slice(src.indexOf('const P = {'), src.indexOf('satisfies Record<string, PeepSpec>'));
      for (const part of UNUSABLE) {
        expect(castTable.includes(`'${part}'`), `${part} is cast but is not skin-safe`).toBe(false);
      }
    });

    it('keeps skin variety instead of collapsing the cast to one tone', () => {
      const used = new Set<string>();
      for (const e of OPENPEEPS_MANIFEST) for (const s of SKINS) if (e.svg.includes(s)) used.add(s);
      expect(used.size).toBe(SKINS.length);
    });
  });

  it('has unique slugs that never collide with the existing flat pack', () => {
    const slugs = OPENPEEPS_MANIFEST.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const undraw = new Set(UNDRAW_MANIFEST.map((e) => e.slug));
    for (const s of slugs) expect(undraw.has(s), s).toBe(false);
  });

  it('gives every scene at least 5 lowercase keywords', () => {
    for (const e of OPENPEEPS_MANIFEST) {
      expect(e.keywords.length, e.slug).toBeGreaterThanOrEqual(5);
      expect(new Set(e.keywords).size, e.slug).toBe(e.keywords.length);
      for (const k of e.keywords) {
        expect(k, `${e.slug}/${k}`).toBe(k.toLowerCase().trim());
        expect(k.length, `${e.slug}/${k}`).toBeGreaterThan(1);
      }
    }
  });

  it('is registered in the licence whitelist as tier-1 CC0 with provenance', () => {
    const spec = PROVIDERS.openpeeps;
    expect(spec).toBeDefined();
    expect(spec!.licence).toBe('CC0 1.0');
    expect(spec!.tier).toBe(1);
    expect(spec!.attributionRequired).toBe(false);
    expect(spec!.commercialUse).toBe(true);
    expect(spec!.modificationAllowed).toBe(true);
    expect(spec!.delivery).toBe('bundled');
    expect(spec!.needsKey).toBe(false);
    // CC0 needs no credit, but provenance must still travel with the asset
    expect(spec!.creator).toBe('Pablo Stanley');
    expect(spec!.sourceUrl).toBe('https://www.openpeeps.com/');
  });
});

describe('Open Peeps character pack — search', () => {
  it('covers the whole imageQuery vocabulary the compose prompt uses', async () => {
    const results = await Promise.all(
      COMPOSE_VOCABULARY.map(async (query) => ({
        query,
        hit: (await searchAssets({ kind: 'illustration', query, limit: 8 })).some(
          (r) => r.provider === 'openpeeps',
        ),
      })),
    );
    expect(results.filter((r) => !r.hit).map((r) => r.query)).toEqual([]);
  }, 90_000);

  it('leads the results for its own character queries', async () => {
    for (const query of ['person presenting', 'team huddle', 'remote worker', 'developer coding']) {
      const hits = await searchAssets({ kind: 'illustration', query, limit: 8 });
      expect(hits[0]?.provider, query).toBe('openpeeps');
    }
  }, 60_000);

  it('returns the exact scene for an exact slug query', async () => {
    const hits = await searchAssets({ kind: 'illustration', query: 'peep-person-rocket-launch', limit: 4 });
    expect(hits[0]?.provider).toBe('openpeeps');
    expect(hits[0]?.providerId).toBe('peep-person-rocket-launch');
  }, 30_000);

  it('stays silent on irrelevant queries instead of dumping the pack', async () => {
    for (const query of ['dog', 'cat', 'lasagne', 'volcano']) {
      const hits = await searchAssets({ kind: 'illustration', query, limit: 48 });
      expect(hits.filter((r) => r.provider === 'openpeeps').length, query).toBe(0);
    }
  }, 60_000);

  it('tags results tier 1 with no attribution required', async () => {
    const hits = await searchAssets({ kind: 'illustration', query: 'team huddle', limit: 6 });
    const peeps = hits.filter((r) => r.provider === 'openpeeps');
    expect(peeps.length).toBeGreaterThan(0);
    for (const r of peeps) {
      expect(r.usageTier).toBe(1);
      expect(r.attributionRequired).toBe(false);
      expect(r.licence).toBe('CC0 1.0');
      expect(r.creator).toBe('Pablo Stanley');
      expect(r.contentUrl.startsWith('data:image/svg+xml')).toBe(true);
    }
  }, 30_000);

  it('browsing illustrations surfaces both bundled packs', async () => {
    const all = await searchAssets({ kind: 'illustration', query: '', limit: 48 });
    expect(all.filter((r) => r.provider === 'openpeeps').length).toBeGreaterThanOrEqual(24);
    expect(all.filter((r) => r.provider === 'undraw').length).toBeGreaterThanOrEqual(24);
  }, 30_000);
});
