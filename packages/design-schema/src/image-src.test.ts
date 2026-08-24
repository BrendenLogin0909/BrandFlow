/**
 * Regression tests for ImageElement.src.
 *
 * Background: `src` was `z.string().url()`, which rejects app-relative paths.
 * Once the asset pipeline started pointing image elements at same-origin authed
 * endpoints (`/api/clients/:id/assets/render/...`, `.../assets/:id/content`),
 * any document using one would parse fine on the canvas but throw the moment it
 * hit `parseDesignDocument()` on save/reopen. These tests pin the accepted
 * shapes so that regression cannot return silently.
 *
 * The scheme allowlist is also asserted: `src` reaches the SVG/PPTX exporters
 * (href/path) and can originate from AI output, so exotic schemes are rejected
 * at the schema boundary.
 */
import { describe, expect, it } from 'vitest';
import { ImageElement } from './schema.js';

const base = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Hero image',
  type: 'image' as const,
  frame: { x: 0, y: 0, width: 400, height: 300, rotation: 0 },
  opacity: 1,
  locked: false,
  visible: true,
  zIndex: 3,
  roleHint: 'image' as const,
  tokenRefs: [],
  recipeSlotId: null,
  meta: {},
  fit: 'contain' as const,
  cornerRadius: 0,
  borderWidth: 0,
  isPlaceholder: false,
};

const accepted: [string, string][] = [
  ['app-relative render URL (bundled illustration packs)', '/api/clients/abc/assets/render/openpeeps/peeps-qa-tester-bug?hue=%231a3c8f'],
  ['app-relative content URL (customer upload)', '/api/clients/abc/assets/def/content'],
  ['app-relative proxy URL (remote CDN via our proxy)', '/api/clients/abc/assets/proxy?url=https%3A%2F%2Fexample.org%2Fa.jpg'],
  ['https URL (stock/provider hotlink)', 'https://example.org/photo.jpg'],
  ['data URI (inline SVG / AI image)', 'data:image/svg+xml;utf8,%3Csvg%2F%3E'],
  ['blob URL (canvas runtime)', 'blob:http://localhost:5173/9f8e7d6c'],
];

const rejected: [string, string][] = [
  ['javascript: scheme', 'javascript:alert(1)'],
  ['file: scheme', 'file:///C:/Windows/win.ini'],
  ['bare relative path with no leading slash', 'assets/logo.png'],
  ['protocol-relative URL', '//evil.example.com/x.png'],
];

describe('ImageElement.src', () => {
  it.each(accepted)('accepts %s', (_label, src) => {
    expect(ImageElement.parse({ ...base, src }).src).toBe(src);
  });

  it.each(rejected)('rejects %s', (_label, src) => {
    expect(() => ImageElement.parse({ ...base, src })).toThrow();
  });

  it('still allows src to be omitted (placeholder awaiting an asset)', () => {
    expect(ImageElement.parse({ ...base, isPlaceholder: true }).src).toBeUndefined();
  });
});
