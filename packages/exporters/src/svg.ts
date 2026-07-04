/**
 * SVG exporter — converts an InternalDesignDocument page into a layered,
 * fully editable SVG. Every element becomes a discrete SVG node (text stays
 * <text>, never outlined paths), so the file opens as editable objects in
 * Figma, Inkscape, Penpot or Illustrator. Zero licensing dependencies.
 */
import type {
  Colour,
  Element,
  Fill,
  InternalDesignDocument,
  Page,
  TextElement,
} from '@brandflow/design-schema';
import { resolveColour, wrapText } from '@brandflow/design-schema';

export function exportPageSvg(doc: InternalDesignDocument, pageIndex: number): string {
  const page = doc.pages[pageIndex];
  if (!page) throw new Error(`Page ${pageIndex} does not exist`);

  const { width, height } = doc.canvas;
  const defs: string[] = [];
  const body = [...page.elements]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((el) => elementToSvg(el, doc, defs))
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>${escapeXml(page.name)}</title>
${defs.length ? `  <defs>\n${defs.join('\n')}\n  </defs>` : ''}
  <rect id="page-background" width="${width}" height="${height}" fill="${fillToSvg(page.background, doc, defs)}"/>
${body}
</svg>`;
}

/** All pages of a carousel as individual SVG strings. */
export function exportAllPagesSvg(doc: InternalDesignDocument): string[] {
  return doc.pages.map((_, i) => exportPageSvg(doc, i));
}

// ---------- element rendering ----------

function elementToSvg(el: Element, doc: InternalDesignDocument, defs: string[]): string {
  if (!el.visible) return '';
  const transform =
    el.frame.rotation !== 0
      ? ` transform="rotate(${el.frame.rotation} ${el.frame.x + el.frame.width / 2} ${el.frame.y + el.frame.height / 2})"`
      : '';
  const common = `id="${el.id}" data-name="${escapeXml(el.name)}" data-role="${el.roleHint ?? ''}" opacity="${el.opacity}"${transform}`;

  switch (el.type) {
    case 'text':
      return textToSvg(el, doc, common);
    case 'shape': {
      const f = el.frame;
      const fill = fillToSvg(el.fill, doc, defs);
      const stroke = el.stroke
        ? ` stroke="${colourToHex(el.stroke, doc)}" stroke-width="${el.strokeWidth}"`
        : '';
      switch (el.shape) {
        case 'ellipse':
          return `  <ellipse ${common} cx="${f.x + f.width / 2}" cy="${f.y + f.height / 2}" rx="${f.width / 2}" ry="${f.height / 2}" fill="${fill}"${stroke}/>`;
        case 'line':
          return `  <line ${common} x1="${f.x}" y1="${f.y + f.height / 2}" x2="${f.x + f.width}" y2="${f.y + f.height / 2}" stroke="${fill}" stroke-width="${Math.max(el.strokeWidth, 2)}"/>`;
        default: // rect, triangle, arrow, polygon simplified to rect/polygon
          if (el.points?.length)
            return `  <polygon ${common} points="${el.points.map((p) => `${p.x},${p.y}`).join(' ')}" fill="${fill}"${stroke}/>`;
          return `  <rect ${common} x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" rx="${el.cornerRadius}" fill="${fill}"${stroke}/>`;
      }
    }
    case 'icon': {
      const f = el.frame;
      if (el.iconRef.svg) {
        // inline the icon's own svg, scaled into the frame, recoloured
        const inner = el.iconRef.svg
          .replace(/<\?xml[^>]*\?>/, '')
          .replace(/currentColor/g, colourToHex(el.colour, doc));
        return `  <g ${common} data-icon="${el.iconRef.provider}/${el.iconRef.name}" transform="translate(${f.x},${f.y})">
    <svg width="${f.width}" height="${f.height}" viewBox="0 0 24 24">${inner}</svg>
  </g>`;
      }
      // no svg body available: keep an editable named placeholder
      return `  <g ${common} data-icon="${el.iconRef.provider}/${el.iconRef.name}">
    <rect x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" rx="${Math.min(f.width, f.height) * 0.2}" fill="none" stroke="${colourToHex(el.colour, doc)}" stroke-width="2" stroke-dasharray="6 4"/>
    <text x="${f.x + f.width / 2}" y="${f.y + f.height / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${Math.max(10, f.height * 0.14)}" fill="${colourToHex(el.colour, doc)}">${escapeXml(el.iconRef.name)}</text>
  </g>`;
    }
    case 'image': {
      const f = el.frame;
      if (!el.src)
        return `  <rect ${common} x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" rx="${el.cornerRadius}" fill="#e5e7eb" data-asset-id="${el.assetId ?? ''}" data-placeholder="true"/>`;
      const aspect = el.fit === 'contain' ? 'xMidYMid meet' : el.fit === 'fill' ? 'none' : 'xMidYMid slice';
      return `  <image ${common} x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" href="${escapeXml(el.src)}" preserveAspectRatio="${aspect}"/>`;
    }
    case 'group':
      return `  <g ${common}>\n${el.children
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((c) => elementToSvg(c, doc, defs))
        .join('\n')}\n  </g>`;
    case 'chart': {
      // simple editable bar representation; charts stay vector shapes
      const f = el.frame;
      const max = Math.max(...el.data.map((d) => d.value), 1);
      const barW = f.width / el.data.length;
      const bars = el.data
        .map((d, i) => {
          const h = (d.value / max) * f.height * 0.9;
          return `    <rect x="${f.x + i * barW + barW * 0.1}" y="${f.y + f.height - h}" width="${barW * 0.8}" height="${h}" fill="${colourToHex({ kind: 'token', token: el.palette[i % el.palette.length]!.token } as Colour, doc)}"/>`;
        })
        .join('\n');
      return `  <g ${common} data-chart="${el.chartType}">\n${bars}\n  </g>`;
    }
  }
}

function textToSvg(el: TextElement, doc: InternalDesignDocument, common: string): string {
  const f = el.frame;
  const lines = wrapText(el.text, el.fontSize, f.width, el.letterSpacing);
  const lineHeightPx = el.fontSize * el.lineHeight;
  const blockHeight = lines.length * lineHeightPx;

  const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
  const x = el.align === 'center' ? f.x + f.width / 2 : el.align === 'right' ? f.x + f.width : f.x;
  const startY =
    el.verticalAlign === 'middle'
      ? f.y + (f.height - blockHeight) / 2
      : el.verticalAlign === 'bottom'
        ? f.y + f.height - blockHeight
        : f.y;
  // first baseline ≈ ascent (~0.8em) into the first line box
  const firstBaseline = startY + lineHeightPx / 2 + el.fontSize * 0.3;

  const tspans = lines
    .map(
      (line, i) =>
        `    <tspan x="${x}" ${i === 0 ? `y="${firstBaseline}"` : `dy="${lineHeightPx}"`}>${escapeXml(line) || ' '}</tspan>`,
    )
    .join('\n');

  return `  <text ${common} text-anchor="${anchor}" font-family="${escapeXml(el.fontFamily)}" font-size="${el.fontSize}" font-weight="${el.fontWeight}" font-style="${el.fontStyle}"${el.letterSpacing ? ` letter-spacing="${el.letterSpacing}"` : ''} fill="${colourToHex(el.colour, doc)}">
${tspans}
  </text>`;
}

// ---------- fills ----------

function colourToHex(colour: Colour, doc: InternalDesignDocument): string {
  return resolveColour(colour, doc) ?? '#000000';
}

let gradientCounter = 0;

function fillToSvg(fill: Fill, doc: InternalDesignDocument, defs: string[]): string {
  if ('kind' in fill && (fill.kind === 'token' || fill.kind === 'raw'))
    return colourToHex(fill, doc);
  if (fill.kind === 'gradient') {
    const id = `grad-${gradientCounter++}`;
    const stops = fill.stops
      .map((s) => `      <stop offset="${s.at * 100}%" stop-color="${colourToHex(s.colour, doc)}"/>`)
      .join('\n');
    const rad = ((fill.angle - 90) * Math.PI) / 180;
    const x2 = 0.5 + Math.cos(rad) / 2;
    const y2 = 0.5 + Math.sin(rad) / 2;
    defs.push(
      `    <linearGradient id="${id}" x1="${1 - x2}" y1="${1 - y2}" x2="${x2}" y2="${y2}">\n${stops}\n    </linearGradient>`,
    );
    return `url(#${id})`;
  }
  return '#ffffff'; // imageFill: swapped for the real asset at export time by the asset pipeline
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
