/**
 * Renders one `InternalDesignDocument` element as Konva nodes and wires it for
 * direct manipulation. The wrapper Group positions the element by its frame
 * *centre* (offset = half-size) so a Konva rotation matches the schema's
 * "rotate about frame centre" convention and the SVG exporter. All element
 * *content* is drawn in the node's LOCAL coordinate space (0..width, 0..height),
 * which keeps leaf rendering independent of where the element sits on the page.
 *
 * Groups: the schema stores group children in ABSOLUTE page coordinates (the
 * group frame is only a pivot), so children are drawn with an `origin` offset
 * that maps page coords into the group's local space. In Phase 1 group children
 * are non-interactive; the group moves/rotates as a unit.
 */
import { Fragment } from 'react';
import type Konva from 'konva';
import { Arc, Ellipse, Group, Image as KImage, Line, Rect, Shape, Text } from 'react-konva';
import type {
  ChartElement,
  Element,
  IconElement,
  ImageElement,
  InternalDesignDocument,
  ShapeElement,
  TextElement,
} from '@brandflow/design-schema';
import { fontStack } from '@brandflow/design-schema';
import { colourHex, fillProps } from './paint';
import { useIconImage, useImageSrc } from './useAssetImage';

export interface ElementNodeProps {
  element: Element;
  doc: InternalDesignDocument;
  /** page-coordinate origin of this element's container (0,0 at top level; the
   *  parent group's top-left inside a group). */
  origin: { x: number; y: number };
  interactive: boolean;
  selected: boolean;
  draggable: boolean;
  registerNode: (id: string, node: Konva.Group | null) => void;
  onSelect: (id: string, evt: Konva.KonvaEventObject<MouseEvent>) => void;
  onDragStart: (id: string, evt: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove: (id: string, evt: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (id: string, evt: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (id: string, evt: Konva.KonvaEventObject<Event>) => void;
  onDblClick: (id: string, evt: Konva.KonvaEventObject<MouseEvent>) => void;
}

export function ElementNode(props: ElementNodeProps) {
  const { element: el, origin, interactive, draggable } = props;
  if (!el.visible) return null;

  const f = el.frame;
  const w = f.width;
  const h = f.height;
  // centre of the frame in the parent's local space
  const cx = f.x - origin.x + w / 2;
  const cy = f.y - origin.y + h / 2;

  return (
    <Group
      ref={(node) => props.registerNode(el.id, node)}
      x={cx}
      y={cy}
      offsetX={w / 2}
      offsetY={h / 2}
      width={w}
      height={h}
      rotation={f.rotation}
      opacity={el.opacity}
      draggable={draggable}
      listening={interactive}
      onMouseDown={interactive ? (e) => props.onSelect(el.id, e) : undefined}
      onTap={interactive ? (e) => props.onSelect(el.id, e as unknown as Konva.KonvaEventObject<MouseEvent>) : undefined}
      onDragStart={interactive ? (e) => props.onDragStart(el.id, e) : undefined}
      onDragMove={interactive ? (e) => props.onDragMove(el.id, e) : undefined}
      onDragEnd={interactive ? (e) => props.onDragEnd(el.id, e) : undefined}
      onTransformEnd={interactive ? (e) => props.onTransformEnd(el.id, e) : undefined}
      onDblClick={interactive ? (e) => props.onDblClick(el.id, e) : undefined}
      onDblTap={interactive ? (e) => props.onDblClick(el.id, e as unknown as Konva.KonvaEventObject<MouseEvent>) : undefined}
    >
      {/* Invisible hit box so the entire frame is selectable/draggable, even
          over transparent regions (text padding, chart gaps, icon whitespace). */}
      {interactive && <HitBox w={w} h={h} />}
      <ElementContent element={el} doc={props.doc} childProps={props} />
    </Group>
  );
}

/** A full-frame hit target that draws nothing in the scene but registers hits. */
function HitBox({ w, h }: { w: number; h: number }) {
  return (
    <Shape
      width={w}
      height={h}
      fill="#000000"
      sceneFunc={() => {
        /* invisible: nothing drawn to the scene canvas */
      }}
      hitFunc={(ctx, shape) => {
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      }}
    />
  );
}

function ElementContent({
  element: el,
  doc,
  childProps,
}: {
  element: Element;
  doc: InternalDesignDocument;
  childProps: ElementNodeProps;
}) {
  switch (el.type) {
    case 'text':
      return <TextContent el={el} doc={doc} />;
    case 'shape':
      return <ShapeContent el={el} doc={doc} />;
    case 'icon':
      return <IconContent el={el} doc={doc} />;
    case 'image':
      return <ImageContent el={el} doc={doc} />;
    case 'chart':
      return <ChartContent el={el} doc={doc} />;
    case 'group':
      return (
        <Fragment>
          {[...el.children]
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((child) => (
              <ElementNode
                key={child.id}
                {...childProps}
                element={child}
                // children live in absolute page coords; map into this group's
                // local space (its top-left = frame origin).
                origin={{ x: el.frame.x, y: el.frame.y }}
                interactive={false}
                selected={false}
                draggable={false}
              />
            ))}
        </Fragment>
      );
  }
}

// ---------- text ----------

function TextContent({ el, doc }: { el: TextElement; doc: InternalDesignDocument }) {
  const fontStyle = `${el.fontStyle === 'italic' ? 'italic ' : ''}${el.fontWeight}`;
  return (
    <Text
      x={0}
      y={0}
      width={el.frame.width}
      height={el.frame.height}
      text={el.text}
      fontFamily={fontStack(el.fontFamily)}
      fontSize={el.fontSize}
      fontStyle={fontStyle}
      lineHeight={el.lineHeight}
      letterSpacing={el.letterSpacing}
      align={el.align}
      verticalAlign={el.verticalAlign}
      wrap="word"
      fill={colourHex(el.colour, doc)}
      listening={false}
    />
  );
}

// ---------- shape ----------

function ShapeContent({ el, doc }: { el: ShapeElement; doc: InternalDesignDocument }) {
  const w = el.frame.width;
  const h = el.frame.height;
  const paint = fillProps(el.fill, doc, { width: w, height: h });
  const stroke = el.stroke ? { stroke: colourHex(el.stroke, doc), strokeWidth: el.strokeWidth } : {};
  const common = { listening: false as const };

  switch (el.shape) {
    case 'ellipse':
      return <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} {...paint} {...stroke} {...common} />;
    case 'line': {
      // fill colour doubles as the stroke colour for a line, matching the exporter
      const colour = paint.fill ?? '#000000';
      return (
        <Line points={[0, h / 2, w, h / 2]} stroke={colour} strokeWidth={Math.max(el.strokeWidth, 2)} {...common} />
      );
    }
    case 'triangle':
      return <Line points={[w / 2, 0, w, h, 0, h]} closed {...paint} {...stroke} {...common} />;
    case 'arrow': {
      const shaft = h * 0.34;
      const headW = Math.min(w * 0.35, h);
      const y0 = (h - shaft) / 2;
      const points = [
        0, y0,
        w - headW, y0,
        w - headW, 0,
        w, h / 2,
        w - headW, h,
        w - headW, y0 + shaft,
        0, y0 + shaft,
      ];
      return <Line points={points} closed {...paint} {...stroke} {...common} />;
    }
    default: {
      // rect, or an explicit polygon by absolute points mapped into local space
      if (el.points?.length) {
        const pts = el.points.flatMap((p) => [p.x - el.frame.x, p.y - el.frame.y]);
        return <Line points={pts} closed {...paint} {...stroke} {...common} />;
      }
      return <Rect x={0} y={0} width={w} height={h} cornerRadius={el.cornerRadius} {...paint} {...stroke} {...common} />;
    }
  }
}

// ---------- icon ----------

function IconContent({ el, doc }: { el: IconElement; doc: InternalDesignDocument }) {
  const hex = colourHex(el.colour, doc);
  const image = useIconImage(el, hex);
  const w = el.frame.width;
  const h = el.frame.height;
  if (image) return <KImage image={image} x={0} y={0} width={w} height={h} listening={false} />;
  // unresolved icon: editable named placeholder (mirrors the SVG exporter)
  return (
    <Fragment>
      <Rect
        x={0}
        y={0}
        width={w}
        height={h}
        cornerRadius={Math.min(w, h) * 0.2}
        stroke={hex}
        strokeWidth={2}
        dash={[6, 4]}
        listening={false}
      />
      <Text
        x={0}
        y={h / 2 - Math.max(10, h * 0.14) / 2}
        width={w}
        text={el.iconRef.name}
        align="center"
        fontSize={Math.max(10, h * 0.14)}
        fill={hex}
        listening={false}
      />
    </Fragment>
  );
}

// ---------- image ----------

function ImageContent({ el, doc }: { el: ImageElement; doc: InternalDesignDocument }) {
  const image = useImageSrc(el.src);
  const w = el.frame.width;
  const h = el.frame.height;
  const border = el.borderColour
    ? { stroke: colourHex(el.borderColour, doc), strokeWidth: el.borderWidth }
    : {};

  if (!image) {
    // placeholder rectangle, matching the exporter's grey box
    return (
      <Rect x={0} y={0} width={w} height={h} cornerRadius={el.cornerRadius} fill="#e5e7eb" {...border} listening={false} />
    );
  }
  const fit = fitImage(image.width, image.height, w, h, el.fit);
  return (
    <KImage
      image={image}
      x={fit.x}
      y={fit.y}
      width={fit.width}
      height={fit.height}
      crop={fit.crop}
      cornerRadius={el.cornerRadius}
      {...border}
      listening={false}
    />
  );
}

/** Konva Image props (position/size + optional source crop) for a fit mode. */
function fitImage(
  iw: number,
  ih: number,
  w: number,
  h: number,
  fit: ImageElement['fit'],
): { x: number; y: number; width: number; height: number; crop?: { x: number; y: number; width: number; height: number } } {
  if (fit === 'fill' || iw <= 0 || ih <= 0) return { x: 0, y: 0, width: w, height: h };
  const scale = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  if (fit === 'contain') {
    const dw = iw * scale;
    const dh = ih * scale;
    return { x: (w - dw) / 2, y: (h - dh) / 2, width: dw, height: dh };
  }
  // cover: fill the box, crop the overflow from the source symmetrically
  const cropW = w / scale;
  const cropH = h / scale;
  return {
    x: 0,
    y: 0,
    width: w,
    height: h,
    crop: { x: (iw - cropW) / 2, y: (ih - cropH) / 2, width: cropW, height: cropH },
  };
}

// ---------- chart ----------

function ChartContent({ el, doc }: { el: ChartElement; doc: InternalDesignDocument }) {
  const w = el.frame.width;
  const h = el.frame.height;
  const palette = (i: number) =>
    colourHex({ kind: 'token', token: el.palette[i % el.palette.length]!.token }, doc);
  const common = { listening: false as const };

  if (el.chartType === 'donut') {
    const total = el.data.reduce((s, d) => s + Math.max(d.value, 0), 0) || 1;
    const outer = Math.min(w, h) / 2 - 8;
    const inner = outer - outer * 0.45;
    const cx = w / 2;
    const cy = h / 2;
    let angle = -90; // 12 o'clock, clockwise — matches the SVG exporter
    return (
      <Fragment>
        {el.data.map((d, i) => {
          const sweep = (Math.max(d.value, 0) / total) * 360;
          const arc = (
            <Arc
              key={i}
              x={cx}
              y={cy}
              innerRadius={inner}
              outerRadius={outer}
              angle={sweep}
              rotation={angle}
              fill={palette(i)}
              {...common}
            />
          );
          angle += sweep;
          return arc;
        })}
      </Fragment>
    );
  }

  if (el.chartType === 'progress') {
    const v = Math.min(Math.max(el.data[0]?.value ?? 0, 0), 100);
    const barH = Math.min(h * 0.4, 28);
    const y = (h - barH) / 2;
    const colour = palette(0);
    return (
      <Fragment>
        <Rect x={0} y={y} width={w} height={barH} cornerRadius={barH / 2} fill={colour} opacity={0.2} {...common} />
        <Rect x={0} y={y} width={(w * v) / 100} height={barH} cornerRadius={barH / 2} fill={colour} {...common} />
        <Text
          x={0}
          y={y - barH}
          width={w}
          align="right"
          text={`${v}%`}
          fontStyle="700"
          fontSize={barH * 0.9}
          fill={colour}
          {...common}
        />
      </Fragment>
    );
  }

  if (el.chartType === 'stat') {
    const d = el.data[0];
    return (
      <Fragment>
        <Text x={0} y={0} width={w} text={String(d?.value ?? '')} fontStyle="800" fontSize={h * 0.5} fill={palette(0)} {...common} />
        <Text x={0} y={h * 0.6} width={w} text={d?.label ?? ''} fontSize={h * 0.16} fill={palette(1 % Math.max(el.palette.length, 1))} {...common} />
      </Fragment>
    );
  }

  // bar chart
  const max = Math.max(...el.data.map((d) => d.value), 1);
  const labelH = Math.min(18, h * 0.12);
  const chartH = h - labelH - 4;
  const barW = w / el.data.length;
  return (
    <Fragment>
      {el.data.map((d, i) => {
        const bh = Math.max((d.value / max) * chartH, 4);
        const bx = i * barW + barW * 0.15;
        return (
          <Fragment key={i}>
            <Rect
              x={bx}
              y={chartH - bh}
              width={barW * 0.7}
              height={bh}
              cornerRadius={Math.min(6, barW * 0.15)}
              fill={palette(i)}
              {...common}
            />
            <Text
              x={i * barW}
              y={chartH + 2}
              width={barW}
              align="center"
              text={d.label.slice(0, 10)}
              fontSize={labelH * 0.85}
              fill={palette(i)}
              {...common}
            />
          </Fragment>
        );
      })}
    </Fragment>
  );
}
