/**
 * Locked-element helpers shared by every save path (design-documents,
 * design-drafts). `locked` survives regeneration and AI edits; the API
 * enforces byte-identity of locked elements at save time, not just the UI
 * (docs/17-design-editing-plan.md §3 non-negotiable invariant #3).
 */
import type { InternalDesignDocument } from './schema.js';

export interface LockableElement {
  id: string;
  locked?: boolean;
  type: string;
  children?: LockableElement[];
}

export function* walkElements(elements: LockableElement[]): Generator<LockableElement> {
  for (const el of elements) {
    yield el;
    if (el.type === 'group' && el.children) yield* walkElements(el.children);
  }
}

export function collectLockedElements(
  doc: Pick<InternalDesignDocument, 'pages'>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const page of doc.pages)
    for (const el of walkElements(page.elements as LockableElement[]))
      if (el.locked) out.set(el.id, JSON.stringify(el));
  return out;
}

export function findElementById(
  doc: Pick<InternalDesignDocument, 'pages'>,
  id: string,
): LockableElement | undefined {
  for (const page of doc.pages)
    for (const el of walkElements(page.elements as LockableElement[])) if (el.id === id) return el;
  return undefined;
}

/**
 * Returns the id of the first locked element that was modified (or removed)
 * between `base` and `incoming`, or null if every locked element survived
 * byte-identical.
 */
export function findLockedElementViolation(
  base: Pick<InternalDesignDocument, 'pages'>,
  incoming: Pick<InternalDesignDocument, 'pages'>,
): string | null {
  const lockedBase = collectLockedElements(base);
  for (const [elId, baseJson] of lockedBase) {
    const incomingEl = findElementById(incoming, elId);
    if (!incomingEl || JSON.stringify(incomingEl) !== baseJson) return elId;
  }
  return null;
}
