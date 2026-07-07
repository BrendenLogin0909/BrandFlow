import type { BrandTokensSnapshot, Element, TextElement } from '@brandflow/design-schema';
import { GOOGLE_FONTS, WEB_SAFE_FONTS } from '@brandflow/design-schema';
import { BrandColourPicker } from './BrandColourPicker';
import type { DesignStudioBindings } from './studio-props';
import { activePageFromBindings } from './studio-props';
import {
  deleteTopLevelElements,
  duplicateTopLevelElements,
  groupTopLevelElements,
  primarySelectedElement,
  setElementColour,
  ungroupTopLevelElement,
  updateElementById,
} from './document-mutations';

const FONT_OPTIONS = [...WEB_SAFE_FONTS, ...GOOGLE_FONTS.map((f) => f.family)];

export interface PropertyInspectorProps extends DesignStudioBindings {
  allowRawColourOverride?: boolean;
}

export function PropertyInspector({
  document: doc,
  activePageId,
  selectedIds,
  onDocumentChange,
  onSelectionChange,
  allowRawColourOverride = false,
}: PropertyInspectorProps) {
  const page = activePageFromBindings({ document: doc, activePageId });
  const el = primarySelectedElement(doc, selectedIds);

  if (!page) {
    return (
      <div className="text-xs text-slate-400">No active page.</div>
    );
  }

  if (selectedIds.length === 0) {
    return (
      <div className="text-xs text-slate-400">Select an element on the canvas to edit properties.</div>
    );
  }

  if (selectedIds.length > 1) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-500">{selectedIds.length} elements selected.</p>
        <ActionButtons
          doc={doc}
          pageId={page.id}
          selectedIds={selectedIds}
          onDocumentChange={onDocumentChange}
          onSelectionChange={onSelectionChange}
        />
      </div>
    );
  }

  if (!el) {
    return <div className="text-xs text-slate-400">Selection not found.</div>;
  }

  const patch = (next: Element) => {
    onDocumentChange(updateElementById(doc, el.id, () => next));
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {el.type} · {el.name}
      </div>

      <label className="block text-xs">
        Name
        <input
          className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
          value={el.name}
          disabled={el.locked}
          onChange={(e) => patch({ ...el, name: e.target.value.slice(0, 120) || el.name })}
        />
      </label>

      <label className="block text-xs">
        Opacity
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          className="mt-1 w-full"
          value={el.opacity}
          disabled={el.locked}
          onChange={(e) => patch({ ...el, opacity: Number(e.target.value) })}
        />
      </label>

      {el.type === 'text' && (
        <TextFields
          el={el}
          locked={el.locked}
          onPatch={(t) => patch(t)}
          brandFonts={doc.brandTokens.fonts}
          brandColours={doc.brandTokens.colours}
          allowRawColourOverride={allowRawColourOverride}
        />
      )}

      {el.type === 'icon' && (
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">Icon colour</div>
          <BrandColourPicker
            colours={doc.brandTokens.colours}
            value={el.colour}
            allowRawOverride={allowRawColourOverride}
            onChange={(colour) => onDocumentChange(setElementColour(doc, el.id, colour))}
          />
        </div>
      )}

      {el.type === 'shape' && el.fill.kind !== 'gradient' && el.fill.kind !== 'imageFill' && (
        <>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600">Fill</div>
            <BrandColourPicker
              colours={doc.brandTokens.colours}
              value={el.fill}
              allowRawOverride={allowRawColourOverride}
              onChange={(colour) => onDocumentChange(setElementColour(doc, el.id, colour, 'fill'))}
            />
          </div>
          <label className="block text-xs">
            Corner radius
            <input
              type="number"
              min={0}
              className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
              value={el.cornerRadius}
              disabled={el.locked}
              onChange={(e) => patch({ ...el, cornerRadius: Math.max(0, Number(e.target.value)) })}
            />
          </label>
        </>
      )}

      {el.type === 'image' && (
        <label className="block text-xs">
          Corner radius
          <input
            type="number"
            min={0}
            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
            value={el.cornerRadius}
            disabled={el.locked}
            onChange={(e) => patch({ ...el, cornerRadius: Math.max(0, Number(e.target.value)) })}
          />
        </label>
      )}

      <ActionButtons
        doc={doc}
        pageId={page.id}
        selectedIds={selectedIds}
        element={el}
        onDocumentChange={onDocumentChange}
        onSelectionChange={onSelectionChange}
      />
    </div>
  );
}

function TextFields({
  el,
  locked,
  onPatch,
  brandFonts,
  brandColours,
  allowRawColourOverride,
}: {
  el: TextElement;
  locked: boolean;
  onPatch: (el: TextElement) => void;
  brandFonts: { heading: string; body: string };
  brandColours: BrandTokensSnapshot['colours'];
  allowRawColourOverride: boolean;
}) {
  const kitFonts = [brandFonts.heading, brandFonts.body, ...FONT_OPTIONS.filter((f) => f !== brandFonts.heading && f !== brandFonts.body)];

  return (
    <>
      <label className="block text-xs">
        Text
        <textarea
          className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
          rows={3}
          value={el.text}
          disabled={locked}
          onChange={(e) => onPatch({ ...el, text: e.target.value.slice(0, 2000) || el.text })}
        />
      </label>
      <label className="block text-xs">
        Font
        <select
          className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
          value={el.fontFamily}
          disabled={locked}
          onChange={(e) => onPatch({ ...el, fontFamily: e.target.value })}
        >
          {kitFonts.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs">
          Size
          <input
            type="number"
            min={8}
            max={400}
            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
            value={el.fontSize}
            disabled={locked}
            onChange={(e) => onPatch({ ...el, fontSize: Number(e.target.value) })}
          />
        </label>
        <label className="block text-xs">
          Weight
          <select
            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
            value={el.fontWeight}
            disabled={locked}
            onChange={(e) => onPatch({ ...el, fontWeight: Number(e.target.value) })}
          >
            {[400, 500, 600, 700, 800].map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs">
        Align
        <select
          className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
          value={el.align}
          disabled={locked}
          onChange={(e) => onPatch({ ...el, align: e.target.value as TextElement['align'] })}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      <div>
        <div className="mb-1 text-xs font-medium text-slate-600">Text colour</div>
        <BrandColourPicker
          colours={brandColours}
          value={el.colour}
          allowRawOverride={allowRawColourOverride}
          onChange={(colour) => onPatch({ ...el, colour })}
        />
      </div>
    </>
  );
}

function ActionButtons({
  doc,
  pageId,
  selectedIds,
  element,
  onDocumentChange,
  onSelectionChange,
}: {
  doc: PropertyInspectorProps['document'];
  pageId: string;
  selectedIds: string[];
  element?: Element;
  onDocumentChange: PropertyInspectorProps['onDocumentChange'];
  onSelectionChange: PropertyInspectorProps['onSelectionChange'];
}) {
  const locked = element?.locked;
  return (
    <div className="flex flex-wrap gap-1 border-t border-slate-200 pt-2">
      <button
        type="button"
        className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40"
        disabled={locked}
        onClick={() => {
          const next = duplicateTopLevelElements(doc, pageId, selectedIds);
          onDocumentChange(next);
        }}
      >
        Duplicate
      </button>
      <button
        type="button"
        className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40"
        disabled={locked || selectedIds.length < 2}
        onClick={() => onDocumentChange(groupTopLevelElements(doc, pageId, selectedIds))}
      >
        Group
      </button>
      <button
        type="button"
        className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40"
        disabled={!element || element.type !== 'group' || element.locked}
        onClick={() => {
          if (element?.type === 'group') {
            onDocumentChange(ungroupTopLevelElement(doc, pageId, element.id));
            onSelectionChange([]);
          }
        }}
      >
        Ungroup
      </button>
      <button
        type="button"
        className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700 disabled:opacity-40"
        disabled={locked}
        onClick={() => {
          onDocumentChange(deleteTopLevelElements(doc, pageId, new Set(selectedIds)));
          onSelectionChange([]);
        }}
      >
        Delete
      </button>
    </div>
  );
}
