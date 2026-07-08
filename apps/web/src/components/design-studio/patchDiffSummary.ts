import type { InternalDesignDocument } from '@brandflow/design-schema';
import { findElement } from './frame';

export interface PatchChangeLine {
  kind: 'text' | 'colour' | 'frame' | 'icon' | 'image' | 'background' | 'added' | 'removed' | 'other';
  elementId?: string;
  label: string;
}

function stableJson(v: unknown): string {
  return JSON.stringify(v);
}

function elementLabel(doc: InternalDesignDocument, id: string): string {
  const hit = findElement(doc, id);
  if (!hit) return id.slice(0, 8);
  const name = hit.name?.trim();
  if (name) return name;
  if (hit.type === 'text' && 'text' in hit) {
    const t = (hit as { text?: string }).text ?? '';
    return t.length > 28 ? `${t.slice(0, 28)}…` : t || hit.type;
  }
  return hit.type;
}

/** Human-readable summary of what changed between two document snapshots. */
export function summarizePatchDiff(
  before: InternalDesignDocument,
  after: InternalDesignDocument,
): PatchChangeLine[] {
  const lines: PatchChangeLine[] = [];
  const beforeIds = new Set<string>();
  const afterIds = new Set<string>();

  for (const page of before.pages) {
    for (const el of page.elements) collectIds(el, beforeIds);
    const nextPage = after.pages.find((p) => p.id === page.id);
    if (nextPage && stableJson(page.background) !== stableJson(nextPage.background)) {
      lines.push({
        kind: 'background',
        label: `Page “${page.name || page.id.slice(0, 8)}” background updated`,
      });
    }
  }
  for (const page of after.pages) {
    for (const el of page.elements) collectIds(el, afterIds);
  }

  for (const id of afterIds) {
    if (!beforeIds.has(id)) {
      lines.push({ kind: 'added', elementId: id, label: `Added ${elementLabel(after, id)}` });
    }
  }
  for (const id of beforeIds) {
    if (!afterIds.has(id)) {
      lines.push({ kind: 'removed', elementId: id, label: `Removed ${elementLabel(before, id)}` });
    }
  }

  for (const id of beforeIds) {
    if (!afterIds.has(id)) continue;
    const a = findElement(before, id);
    const b = findElement(after, id);
    if (!a || !b || a.type !== b.type) continue;

    if (a.type === 'text' && b.type === 'text' && a.text !== b.text) {
      lines.push({
        kind: 'text',
        elementId: id,
        label: `“${elementLabel(before, id)}” text updated`,
      });
    }
    if (stableJson(a.frame) !== stableJson(b.frame)) {
      lines.push({
        kind: 'frame',
        elementId: id,
        label: `“${elementLabel(before, id)}” moved or resized`,
      });
    }
    if ('colour' in a && 'colour' in b && stableJson(a.colour) !== stableJson(b.colour)) {
      lines.push({
        kind: 'colour',
        elementId: id,
        label: `“${elementLabel(before, id)}” colour updated`,
      });
    }
    if (a.type === 'icon' && b.type === 'icon' && a.iconRef.name !== b.iconRef.name) {
      lines.push({
        kind: 'icon',
        elementId: id,
        label: `Icon “${a.iconRef.name}” → “${b.iconRef.name}”`,
      });
    }
    if (a.type === 'image' && b.type === 'image') {
      const imgChanged =
        a.assetId !== b.assetId || a.src !== b.src || a.isPlaceholder !== b.isPlaceholder;
      if (imgChanged) {
        lines.push({ kind: 'image', elementId: id, label: `Image on “${elementLabel(before, id)}” updated` });
      }
    }
  }

  if (!lines.length) {
    lines.push({ kind: 'other', label: 'No visible element changes detected (layout may be subtly adjusted)' });
  }
  return lines;
}

function collectIds(el: { id: string; type: string; children?: { id: string; type: string; children?: unknown[] }[] }, out: Set<string>) {
  out.add(el.id);
  if (el.type === 'group' && el.children) {
    for (const child of el.children) collectIds(child as typeof el, out);
  }
}
