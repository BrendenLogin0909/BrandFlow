import { describe, expect, it } from 'vitest';
import { UNDRAW_MANIFEST } from './undraw-manifest.js';
import { searchAssets } from './providers.js';

describe('flat illustration pack', () => {
  it('has at least 280 bundled scenes with accent colour', () => {
    expect(UNDRAW_MANIFEST.length).toBeGreaterThanOrEqual(280);
    for (const e of UNDRAW_MANIFEST) {
      expect(e.slug).toMatch(/^[a-z0-9-]+$/);
      expect(e.keywords.length).toBeGreaterThanOrEqual(5);
      expect(e.svg).toContain('#6c63ff');
      expect(e.svg).toContain('<svg');
    }
  });

  it('keyword search prefers matching character/chart scenes', async () => {
    // The bundled Open Peeps character pack now outranks this pack globally
    // (see the provider rank in providers.ts — hand-drawn characters are the
    // preferred hero art), so this asserts keyword precision WITHIN the flat
    // pack: its own best-matching scene must still come first among its hits.
    const qa = await searchAssets({ kind: 'illustration', query: 'qa tester bug', limit: 8 });
    expect(qa.find((r) => r.provider === 'undraw')?.providerId).toBe('qa-tester-bug');

    const ladder = await searchAssets({ kind: 'illustration', query: 'maturity ladder', limit: 8 });
    expect(ladder.find((r) => r.provider === 'undraw')?.providerId).toBe('maturity-ladder');
  });

  it('lists exact keyword matches before partial prefix matches', async () => {
    const team = await searchAssets({ kind: 'illustration', query: 'team', limit: 12 });
    const undraw = team.filter((r) => r.provider === 'undraw');
    expect(undraw.length).toBeGreaterThan(0);
    // Names that start with "team" should rank above ones that only contain it later
    const labels = undraw.map((r) => r.label.toLowerCase());
    const firstStarts = labels.findIndex((l) => l.startsWith('team'));
    expect(firstStarts).toBeGreaterThanOrEqual(0);
    expect(firstStarts).toBeLessThan(3);
  });

  it('does not return the whole flat pack for irrelevant queries', async () => {
    const dog = await searchAssets({ kind: 'illustration', query: 'dog', limit: 48 });
    const undrawHits = dog.filter((r) => r.provider === 'undraw');
    expect(undrawHits.length).toBe(0);
  });

  it('does not match cat inside scatter/location', async () => {
    const cat = await searchAssets({ kind: 'illustration', query: 'cat', limit: 48 });
    const undrawHits = cat.filter((r) => r.provider === 'undraw');
    expect(undrawHits.every((r) => !/scatter|location|chat/i.test(r.label))).toBe(true);
    // No real "cat" scenes in the B2B pack → expect zero undraw hits
    expect(undrawHits.length).toBe(0);
  });

  it('empty illustration browse returns many flat scenes (not just DiceBear)', async () => {
    const empty = await searchAssets({ kind: 'illustration', query: '', limit: 48 });
    const undrawHits = empty.filter((r) => r.provider === 'undraw');
    expect(undrawHits.length).toBeGreaterThanOrEqual(24);
    expect(empty.every((r) => r.provider !== 'dicebear')).toBe(true);
  });
});
