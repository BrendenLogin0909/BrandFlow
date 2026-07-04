/**
 * PPTX exporter — converts an InternalDesignDocument into a PowerPoint file
 * where every element is a native, editable PowerPoint object (text boxes,
 * shapes, images). Opens in PowerPoint, Google Slides and LibreOffice — all
 * free-to-use editing surfaces — with no design-SDK licence required.
 *
 * Uses pptxgenjs (MIT).
 */
import PptxGenJS from 'pptxgenjs';
import type { Colour, Element, InternalDesignDocument } from '@brandflow/design-schema';
import { resolveColour } from '@brandflow/design-schema';

const PX_PER_INCH = 96;
const px = (n: number) => n / PX_PER_INCH;
const pt = (fontSizePx: number) => fontSizePx * 0.75; // 96px/in vs 72pt/in

export async function exportPptx(doc: InternalDesignDocument): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({
    name: 'BRANDFLOW',
    width: px(doc.canvas.width),
    height: px(doc.canvas.height),
  });
  pptx.layout = 'BRANDFLOW';
  pptx.title = `BrandFlow design ${doc.id}`;

  for (const page of doc.pages) {
    const slide = pptx.addSlide();
    const bg = page.background;
    if ('kind' in bg && (bg.kind === 'token' || bg.kind === 'raw'))
      slide.background = { color: hex(bg, doc) };

    for (const el of flatten(page.elements).sort((a, b) => a.zIndex - b.zIndex))
      addElement(pptx, slide, el, doc);
  }

  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
}

// Groups flatten to absolute-positioned elements (frames are page coordinates).
function flatten(elements: Element[]): Element[] {
  return elements.flatMap((el) => (el.type === 'group' ? flatten(el.children) : [el]));
}

function addElement(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  el: Element,
  doc: InternalDesignDocument,
): void {
  if (!el.visible) return;
  const box = {
    x: px(el.frame.x),
    y: px(el.frame.y),
    w: px(el.frame.width),
    h: px(el.frame.height),
    rotate: el.frame.rotation || undefined,
  };

  switch (el.type) {
    case 'text':
      slide.addText(el.text, {
        ...box,
        fontFace: el.fontFamily,
        fontSize: pt(el.fontSize),
        bold: el.fontWeight >= 600,
        italic: el.fontStyle === 'italic',
        color: hex(el.colour, doc),
        align: el.align,
        valign: el.verticalAlign,
        lineSpacingMultiple: el.lineHeight,
        charSpacing: el.letterSpacing ? pt(el.letterSpacing) : undefined,
        transparency: (1 - el.opacity) * 100,
        wrap: true,
      });
      return;

    case 'shape': {
      const fill = el.fill;
      const solid =
        'kind' in fill && (fill.kind === 'token' || fill.kind === 'raw')
          ? hex(fill, doc)
          : fill.kind === 'gradient'
            ? hex(fill.stops[0]!.colour, doc) // PPTX gradient support kept simple: first stop
            : 'FFFFFF';
      const type =
        el.shape === 'ellipse'
          ? pptx.ShapeType.ellipse
          : el.shape === 'line'
            ? pptx.ShapeType.line
            : el.shape === 'triangle'
              ? pptx.ShapeType.triangle
              : el.cornerRadius > 0
                ? pptx.ShapeType.roundRect
                : pptx.ShapeType.rect;
      slide.addShape(type, {
        ...box,
        fill: el.shape === 'line' ? undefined : { color: solid, transparency: (1 - el.opacity) * 100 },
        line:
          el.shape === 'line'
            ? { color: solid, width: Math.max(pt(el.strokeWidth), 1) }
            : el.stroke
              ? { color: hex(el.stroke, doc), width: pt(el.strokeWidth) }
              : { type: 'none' },
        rectRadius: el.cornerRadius > 0 ? px(el.cornerRadius) : undefined,
      });
      return;
    }

    case 'icon':
      if (el.iconRef.svg) {
        const svg = el.iconRef.svg.replace(/currentColor/g, `#${hex(el.colour, doc)}`);
        slide.addImage({
          ...box,
          data: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
        });
      } else {
        // keep a named, editable placeholder so nothing silently disappears
        slide.addShape(pptx.ShapeType.roundRect, {
          ...box,
          fill: { color: hex(el.colour, doc), transparency: 85 },
          line: { color: hex(el.colour, doc), width: 1, dashType: 'dash' },
        });
        slide.addText(el.iconRef.name, {
          ...box,
          fontSize: 8,
          color: hex(el.colour, doc),
          align: 'center',
          valign: 'middle',
        });
      }
      return;

    case 'image':
      if (el.src) slide.addImage({ ...box, path: el.src, sizing: { type: el.fit === 'contain' ? 'contain' : 'cover', w: box.w, h: box.h } });
      else
        slide.addShape(pptx.ShapeType.rect, {
          ...box,
          fill: { color: 'E5E7EB' },
          line: { type: 'none' },
        });
      return;

    case 'chart': {
      // native editable PowerPoint chart
      slide.addChart(pptx.ChartType.bar, [
        {
          name: el.name,
          labels: el.data.map((d) => d.label),
          values: el.data.map((d) => d.value),
        },
      ], { ...box });
      return;
    }

    case 'group':
      return; // flattened above
  }
}

/** pptxgenjs wants hex without '#'. */
function hex(colour: Colour, doc: InternalDesignDocument): string {
  return (resolveColour(colour, doc) ?? '#000000').replace('#', '').toUpperCase();
}
