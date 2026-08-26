/**
 * Guards the containment contract documented at the top of rasterise.ts.
 *
 * @resvg/resvg-js is MPL-2.0 — the only weak-copyleft dependency in the
 * product. Our position is that using the unmodified package server-side sits
 * within the licence, but that position could change, so the dependency has to
 * stay removable. It only stays removable if exactly one module touches it.
 *
 * If this test fails, do not relax it: move the code that needs rendering
 * behind `rasterisePage()` instead.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = 'services/rasterise.ts';

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe('MPL-2.0 rasteriser containment', () => {
  it('is imported by exactly one module', () => {
    // Match real import/require statements, not prose mentions — this file
    // names the package in its own documentation.
    const IMPORTS_RESVG = /(?:from|require\()\s*['"]@resvg\/resvg-js['"]/;
    const importers = sourceFiles(SRC)
      .filter((f) => IMPORTS_RESVG.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f).split(path.sep).join('/'));
    expect(importers).toEqual([ALLOWED]);
  });

  it('exposes rendering through a plain interface, so callers never hold a resvg type', () => {
    const src = readFileSync(path.join(SRC, ALLOWED), 'utf8');
    // Resvg types may be used internally but must not leak from the public API.
    expect(/export .*\bResvg\b/.test(src)).toBe(false);
  });
});
