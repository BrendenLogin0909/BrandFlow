/**
 * DesignCanvas — BrandFlow's native, Konva-based editor surface. It renders one
 * page of an `InternalDesignDocument` and supports direct manipulation (select,
 * move, resize, rotate) plus snap guides and zoom/pan. It is a *controlled*
 * component: it never owns the document or the selection — it renders the props
 * it is given and reports every change through callbacks.
 *
 *   document          the authoritative doc to render
 *   activePageId      which page to show (falls back to the first page)
 *   selectedIds       currently selected element ids (controlled)
 *   onDocumentChange  called with a new doc after any geometry edit
 *   onSelectionChange called with the next selection after a click/marquee
 *
 * ── hybrid-mode contract ─────────────────────────────────────────────────────
 * The FIRST time the user manually changes geometry (move/resize/rotate), this
 * component fires `onFirstManualEdit`. The caller (Design Studio) must, on that
 * signal, set `playgroundSource.mode = 'hybrid'` on a recipe-derived design:
 * from then on, slot text may still flow into bound elements (`recipeSlotId`),
 * but geometry is manual/AI-owned and recipe regeneration must not clobber it.
 * See docs/17-design-editing-plan.md §4.3. This component only *reports* the
 * event; it does not mutate `playgroundSource` itself.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import { Group, Layer, Line, Rect, Stage, Transformer } from 'react-konva';
import type { InternalDesignDocument } from '@brandflow/design-schema';
import { ElementNode } from './ElementNode';
import { fillProps } from './paint';
import {
  activePage,
  findElement,
  isLocked,
  normaliseRotation,
  roundPx,
  translateElement,
  updateElementFrame,
  type FrameTransform,
} from './frame';
import { computeSnap, DEFAULT_SNAP_THRESHOLD, type Box, type SnapGuide } from './snapping';

export interface DesignCanvasProps {
  document: InternalDesignDocument;
  activePageId: string | null;
  selectedIds: string[];
  onDocumentChange: (doc: InternalDesignDocument) => void;
  onSelectionChange: (ids: string[]) => void;
  /** Fired once, on the first manual geometry edit — see hybrid-mode contract. */
  onFirstManualEdit?: () => void;
  /** Double-click on a text element (Phase 2 opens the inspector textarea). */
  onRequestTextEdit?: (id: string) => void;
  /** Click on empty canvas area — coordinates in page space (px). */
  onPageClick?: (pageX: number, pageY: number) => void;
  /** Visual hint that the next canvas click will place an asset. */
  insertMode?: boolean;
  className?: string;
  minZoom?: number;
  maxZoom?: number;
}

const MIN_FRAME = 5;

export function DesignCanvas(props: DesignCanvasProps) {
  const {
    document: doc,
    activePageId,
    selectedIds,
    onDocumentChange,
    onSelectionChange,
    onFirstManualEdit,
    onRequestTextEdit,
    onPageClick,
    insertMode,
    minZoom = 0.05,
    maxZoom = 8,
  } = props;

  const page = activePage(doc, activePageId);
  const canvas = doc.canvas;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodes = useRef<Map<string, Konva.Group>>(new Map());
  const firstEditFired = useRef(false);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const hasFitted = useRef(false);

  // ---------- sizing ----------
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitView = useCallback(() => {
    if (size.width === 0 || size.height === 0) return;
    const pad = 48;
    const s = clamp(
      Math.min((size.width - pad) / canvas.width, (size.height - pad) / canvas.height),
      minZoom,
      maxZoom,
    );
    setScale(s);
    setStagePos({
      x: (size.width - canvas.width * s) / 2,
      y: (size.height - canvas.height * s) / 2,
    });
  }, [size.width, size.height, canvas.width, canvas.height, minZoom, maxZoom]);

  // auto-fit on first measurement and whenever the page (canvas dims) changes
  useEffect(() => {
    if (size.width === 0 || size.height === 0) return;
    if (!hasFitted.current) {
      hasFitted.current = true;
      fitView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  useEffect(() => {
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId, canvas.width, canvas.height]);

  // ---------- node registry + transformer wiring ----------
  const registerNode = useCallback((id: string, node: Konva.Group | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  }, []);

  // Attach the transformer to the non-locked selected nodes after every render
  // (selection or document may have changed the underlying nodes).
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const targets = selectedIds
      .filter((id) => !isLocked(doc, id))
      .map((id) => nodes.current.get(id))
      .filter((n): n is Konva.Group => Boolean(n));
    tr.nodes(targets);
    tr.getLayer()?.batchDraw();
  });

  const selectionHasGroup = selectedIds.some((id) => findElement(doc, id)?.type === 'group');

  // ---------- selection ----------
  const handleSelect = useCallback(
    (id: string, evt: Konva.KonvaEventObject<MouseEvent>) => {
      const additive = evt.evt.shiftKey || evt.evt.metaKey || evt.evt.ctrlKey;
      if (additive) {
        onSelectionChange(
          selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id],
        );
      } else if (!selectedIds.includes(id) || selectedIds.length > 1) {
        onSelectionChange([id]);
      }
    },
    [selectedIds, onSelectionChange],
  );

  const clearSelection = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const target = e.target;
      if (target === stageRef.current || target.name() === '__background__') {
        const stage = stageRef.current;
        if (stage && onPageClick) {
          const pointer = stage.getPointerPosition();
          if (pointer) {
            const pageX = (pointer.x - stagePos.x) / scale;
            const pageY = (pointer.y - stagePos.y) / scale;
            if (pageX >= 0 && pageY >= 0 && pageX <= canvas.width && pageY <= canvas.height) {
              onPageClick(pageX, pageY);
            }
          }
        }
        if (selectedIds.length) onSelectionChange([]);
      }
    },
    [selectedIds, onSelectionChange, onPageClick, stagePos, scale, canvas.width, canvas.height],
  );

  const fireFirstEdit = useCallback(() => {
    if (!firstEditFired.current) {
      firstEditFired.current = true;
      onFirstManualEdit?.();
    }
  }, [onFirstManualEdit]);

  // ---------- drag (move), with snapping + multi-select ----------
  // Which ids move together, and their centre positions at drag start.
  const drag = useRef<{ ids: string[]; startCenters: Map<string, { x: number; y: number }>; primary: string } | null>(
    null,
  );

  const handleDragStart = useCallback(
    (id: string) => {
      // move the whole selection if the grabbed element is part of it, else just it
      const ids = (selectedIds.includes(id) ? selectedIds : [id]).filter((eid) => !isLocked(doc, eid));
      const startCenters = new Map<string, { x: number; y: number }>();
      for (const eid of ids) {
        const n = nodes.current.get(eid);
        if (n) startCenters.set(eid, { x: n.x(), y: n.y() });
      }
      drag.current = { ids, startCenters, primary: id };
      setGuides([]);
    },
    [selectedIds, doc],
  );

  const handleDragMove = useCallback(
    (id: string) => {
      const session = drag.current;
      if (!session || session.primary !== id) return;
      const primaryNode = nodes.current.get(id);
      const el = findElement(doc, id);
      if (!primaryNode || !el) return;

      const w = el.frame.width;
      const h = el.frame.height;
      const box: Box = { x: primaryNode.x() - w / 2, y: primaryNode.y() - h / 2, width: w, height: h };

      // snap the primary box against every other element on the page + canvas
      const neighbours: Box[] = page.elements
        .filter((n) => !session.ids.includes(n.id))
        .map((n) => ({ x: n.frame.x, y: n.frame.y, width: n.frame.width, height: n.frame.height }));
      const snapped = computeSnap(box, neighbours, canvas, DEFAULT_SNAP_THRESHOLD / scale);

      // apply the snap correction to the primary node
      primaryNode.x(snapped.x + w / 2);
      primaryNode.y(snapped.y + h / 2);
      setGuides(snapped.guides);

      // move the rest of the selection by the same delta from their start
      const start = session.startCenters.get(id)!;
      const dx = primaryNode.x() - start.x;
      const dy = primaryNode.y() - start.y;
      for (const eid of session.ids) {
        if (eid === id) continue;
        const n = nodes.current.get(eid);
        const s = session.startCenters.get(eid);
        if (n && s) {
          n.x(s.x + dx);
          n.y(s.y + dy);
        }
      }
    },
    [doc, page.elements, canvas, scale],
  );

  const handleDragEnd = useCallback(
    (id: string) => {
      const session = drag.current;
      drag.current = null;
      setGuides([]);
      if (!session) return;
      const primaryNode = nodes.current.get(id);
      const start = session.startCenters.get(id);
      if (!primaryNode || !start) return;
      const dx = roundPx(primaryNode.x() - start.x);
      const dy = roundPx(primaryNode.y() - start.y);
      if (dx === 0 && dy === 0) return;

      // one delta translates every moved id (translateElement handles group subtrees)
      let next = doc;
      for (const eid of session.ids) next = translateElement(next, eid, dx, dy);
      if (next !== doc) {
        fireFirstEdit();
        onDocumentChange(next);
      }
    },
    [doc, onDocumentChange, fireFirstEdit],
  );

  // ---------- resize / rotate ----------
  const handleTransformEnd = useCallback(
    (id: string) => {
      const node = nodes.current.get(id);
      const el = findElement(doc, id);
      if (!node || !el || el.locked) return;

      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const newW = Math.max(MIN_FRAME, el.frame.width * scaleX);
      const newH = Math.max(MIN_FRAME, el.frame.height * scaleY);
      // reset the node scale — the new size lives in the frame, not the node
      node.scaleX(1);
      node.scaleY(1);

      const centerX = node.x();
      const centerY = node.y();
      const transform: FrameTransform = {
        x: centerX - newW / 2,
        y: centerY - newH / 2,
        width: newW,
        height: newH,
        rotation: normaliseRotation(node.rotation()),
      };
      const next = updateElementFrame(doc, id, transform);
      if (next !== doc) {
        fireFirstEdit();
        onDocumentChange(next);
      }
    },
    [doc, onDocumentChange, fireFirstEdit],
  );

  // ---------- zoom / pan ----------
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const oldScale = scale;
      const mousePointTo = {
        x: (pointer.x - stagePos.x) / oldScale,
        y: (pointer.y - stagePos.y) / oldScale,
      };
      const factor = 1.05;
      const newScale = clamp(e.evt.deltaY > 0 ? oldScale / factor : oldScale * factor, minZoom, maxZoom);
      setScale(newScale);
      setStagePos({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
    },
    [scale, stagePos, minZoom, maxZoom],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const newScale = clamp(scale * factor, minZoom, maxZoom);
      // keep the canvas centre fixed while zooming with the buttons
      const cx = size.width / 2;
      const cy = size.height / 2;
      const pointTo = { x: (cx - stagePos.x) / scale, y: (cy - stagePos.y) / scale };
      setScale(newScale);
      setStagePos({ x: cx - pointTo.x * newScale, y: cy - pointTo.y * newScale });
    },
    [scale, stagePos, size, minZoom, maxZoom],
  );

  const sorted = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
  const bgFill = fillProps(page.background, doc, { width: canvas.width, height: canvas.height });
  const guideStroke = 1 / scale;

  const elementProps = {
    doc,
    origin: { x: 0, y: 0 },
    interactive: true,
    registerNode,
    onSelect: handleSelect,
    onDragStart: (eid: string) => handleDragStart(eid),
    onDragMove: (eid: string) => handleDragMove(eid),
    onDragEnd: (eid: string) => handleDragEnd(eid),
    onTransformEnd: (eid: string) => handleTransformEnd(eid),
    onDblClick: (eid: string) => {
      if (findElement(doc, eid)?.type === 'text') onRequestTextEdit?.(eid);
    },
  };

  return (
    <div
      ref={containerRef}
      className={`${props.className ?? 'relative h-full w-full overflow-hidden bg-slate-200'} ${
        insertMode ? 'cursor-crosshair' : ''
      }`}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={scale}
        scaleY={scale}
        x={stagePos.x}
        y={stagePos.y}
        draggable
        onWheel={handleWheel}
        onMouseDown={clearSelection}
        onTap={clearSelection}
        onDragEnd={(e) => {
          // sync pan position after a stage (empty-area) drag; ignore node drags
          if (e.target === stageRef.current) setStagePos({ x: e.target.x(), y: e.target.y() });
        }}
      >
        <Layer>
          {/* page surface — also the pan handle + deselect target */}
          <Rect name="__background__" x={0} y={0} width={canvas.width} height={canvas.height} {...bgFill} />
          {/* thin page border so the canvas edge is visible on any background */}
          <Rect
            x={0}
            y={0}
            width={canvas.width}
            height={canvas.height}
            stroke="#cbd5e1"
            strokeWidth={guideStroke}
            listening={false}
          />

          {sorted.map((el) => (
            <ElementNode
              key={el.id}
              {...elementProps}
              element={el}
              selected={selectedIds.includes(el.id)}
              draggable={!el.locked}
            />
          ))}

          {/* locked-but-selected outline (no transformer is attached to these) */}
          {selectedIds
            .map((id) => findElement(doc, id))
            .filter((el): el is NonNullable<typeof el> => Boolean(el) && el!.locked)
            .map((el) => (
              <Rect
                key={`lock-${el.id}`}
                x={el.frame.x}
                y={el.frame.y}
                width={el.frame.width}
                height={el.frame.height}
                rotation={el.frame.rotation}
                offsetX={0}
                stroke="#ef4444"
                strokeWidth={guideStroke * 1.5}
                dash={[6 / scale, 4 / scale]}
                listening={false}
              />
            ))}

          {/* snap guides */}
          <Group listening={false}>
            {guides.map((g, i) =>
              g.axis === 'x' ? (
                <Line key={i} points={[g.position, g.start, g.position, g.end]} stroke="#ec4899" strokeWidth={guideStroke} />
              ) : (
                <Line key={i} points={[g.start, g.position, g.end, g.position]} stroke="#ec4899" strokeWidth={guideStroke} />
              ),
            )}
          </Group>

          <Transformer
            ref={transformerRef}
            rotateEnabled
            resizeEnabled={!selectionHasGroup}
            enabledAnchors={
              selectionHasGroup
                ? []
                : ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']
            }
            ignoreStroke
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            anchorStroke="#6366f1"
            anchorFill="#ffffff"
            anchorSize={9}
            borderStroke="#6366f1"
            boundBoxFunc={(oldBox, newBox) =>
              newBox.width < MIN_FRAME || newBox.height < MIN_FRAME ? oldBox : newBox
            }
          />
        </Layer>
      </Stage>

      {/* zoom controls (plain HTML overlay, outside the Konva tree) */}
      <div className="pointer-events-auto absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-slate-300 bg-white/90 px-1.5 py-1 text-sm shadow-sm backdrop-blur">
        <button className="h-6 w-6 rounded hover:bg-slate-100" title="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
          −
        </button>
        <span className="w-12 text-center tabular-nums text-slate-600">{Math.round(scale * 100)}%</span>
        <button className="h-6 w-6 rounded hover:bg-slate-100" title="Zoom in" onClick={() => zoomBy(1.2)}>
          +
        </button>
        <button className="ml-1 rounded px-2 text-xs font-medium text-slate-600 hover:bg-slate-100" title="Fit to view" onClick={fitView}>
          Fit
        </button>
      </div>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
