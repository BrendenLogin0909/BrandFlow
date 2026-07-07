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
import { fontStack, googleFontsCssUrl, resolveColour, wrapText } from '@brandflow/design-schema';
import { resolveIconSvg, styleIconSvg } from './icons.js';

export function exportPageSvg(doc: InternalDesignDocument, pageIndex: number): string {
  const page = doc.pages[pageIndex];
  if (!page) throw new Error(`Page ${pageIndex} does not exist`);

  const { width, height } = doc.canvas;
  const defs: string[] = [];
  // Embed the webfonts the page actually uses so the standalone .svg renders
  // with real brand typography when opened in a browser — free, no key. Tools
  // that ignore @import (Figma/Illustrator) still keep the family name + stack.
  const fontUrl = googleFontsCssUrl(collectFontFamilies(page.elements));
  if (fontUrl)
    defs.push(`    <style type="text/css"><![CDATA[\n@import url('${fontUrl}');\n    ]]></style>`);
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
${body}${creditsToSvg(doc, width, height)}
</svg>`;
}

/** All pages of a carousel as individual SVG strings. */
export function exportAllPagesSvg(doc: InternalDesignDocument): string[] {
  return doc.pages.map((_, i) => exportPageSvg(doc, i));
}

/** Small credits line for licence attributions, pinned to the bottom margin. */
function creditsToSvg(doc: InternalDesignDocument, width: number, height: number): string {
  const credits = doc.attributions;
  if (!credits?.length) return '';
  const text = `Credits: ${credits.join(' · ')}`;
  const size = Math.max(9, Math.round(height * 0.014));
  return `\n  <text id="asset-credits" x="${Math.round(width * 0.03)}" y="${height - size}" font-family="Arial, sans-serif" font-size="${size}" fill="#9ca3af" opacity="0.85">${escapeXml(text)}</text>`;
}

/** Every font family referenced by text elements, recursing into groups. */
function collectFontFamilies(elements: Element[]): string[] {
  const out: string[] = [];
  for (const el of elements) {
    if (el.type === 'text') out.push(el.fontFamily);
    else if (el.type === 'group') out.push(...collectFontFamilies(el.children));
  }
  return out;
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
        case 'triangle': {
          const pts = `${f.x + f.width / 2},${f.y} ${f.x + f.width},${f.y + f.height} ${f.x},${f.y + f.height}`;
          return `  <polygon ${common} points="${pts}" fill="${fill}"${stroke}/>`;
        }
        case 'arrow': {
          // horizontal arrow filling the frame (rotate via frame.rotation)
          const shaft = f.height * 0.34;
          const headW = Math.min(f.width * 0.35, f.height);
          const y0 = f.y + (f.height - shaft) / 2;
          const pts = [
            `${f.x},${y0}`,
            `${f.x + f.width - headW},${y0}`,
            `${f.x + f.width - headW},${f.y}`,
            `${f.x + f.width},${f.y + f.height / 2}`,
            `${f.x + f.width - headW},${f.y + f.height}`,
            `${f.x + f.width - headW},${y0 + shaft}`,
            `${f.x},${y0 + shaft}`,
          ].join(' ');
          return `  <polygon ${common} points="${pts}" fill="${fill}"${stroke}/>`;
        }
        default: // rect, polygon
          if (el.points?.length)
            return `  <polygon ${common} points="${el.points.map((p) => `${p.x},${p.y}`).join(' ')}" fill="${fill}"${stroke}/>`;
          return `  <rect ${common} x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" rx="${el.cornerRadius}" fill="${fill}"${stroke}/>`;
      }
    }
    case 'icon': {
      const f = el.frame;
      const artwork = resolveIconSvg(el.iconRef);
      if (artwork) {
        const hexColour = colourToHex(el.colour, doc);
        const inner = styleIconSvg(artwork, hexColour, el.strokeWidth)
          .replace(/^[\s\S]*?<svg[^>]*>/, '')
          .replace(/<\/svg>\s*$/, '');
        // paint attributes live on the wrapper: lucide paths inherit stroke
        // from their root, which we strip — without these the icon is invisible
        return `  <g ${common} data-icon="${el.iconRef.provider}/${el.iconRef.name}" transform="translate(${f.x},${f.y})">
    <svg width="${f.width}" height="${f.height}" viewBox="0 0 24 24" fill="none" stroke="${hexColour}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>
  </g>`;
      }
      // unknown icon: keep an editable named placeholder
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
      // charts render as grouped vector shapes so they stay editable
      const f = el.frame;
      const palette = (i: number) =>
        colourToHex({ kind: 'token', token: el.palette[i % el.palette.length]!.token } as Colour, doc);

      if (el.chartType === 'donut') {
        const total = el.data.reduce((s, d) => s + Math.max(d.value, 0), 0) || 1;
        const r = Math.min(f.width, f.height) / 2 - 8;
        const cx = f.x + f.width / 2;
        const cy = f.y + f.height / 2;
        const circumference = 2 * Math.PI * r;
        let offset = 0;
        const rings = el.data
          .map((d, i) => {
            const frac = Math.max(d.value, 0) / total;
            const seg = `    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${palette(i)}" stroke-width="${r * 0.45}" stroke-dasharray="${(frac * circumference).toFixed(1)} ${circumference.toFixed(1)}" stroke-dashoffset="${(-offset * circumference).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`;
            offset += frac;
            return seg;
          })
          .join('\n');
        return `  <g ${common} data-chart="donut">\n${rings}\n  </g>`;
      }

      if (el.chartType === 'progress') {
        const v = Math.min(Math.max(el.data[0]?.value ?? 0, 0), 100);
        const barH = Math.min(f.height * 0.4, 28);
        const y = f.y + (f.height - barH) / 2;
        return `  <g ${common} data-chart="progress">
    <rect x="${f.x}" y="${y}" width="${f.width}" height="${barH}" rx="${barH / 2}" fill="${palette(0)}" opacity="0.2"/>
    <rect x="${f.x}" y="${y}" width="${(f.width * v) / 100}" height="${barH}" rx="${barH / 2}" fill="${palette(0)}"/>
    <text x="${f.x + f.width}" y="${y - 8}" text-anchor="end" font-family="Arial" font-weight="700" font-size="${barH * 0.9}" fill="${palette(0)}">${v}%</text>
  </g>`;
      }

      if (el.chartType === 'stat') {
        const d = el.data[0];
        return `  <g ${common} data-chart="stat">
    <text x="${f.x}" y="${f.y + f.height * 0.55}" font-family="Arial" font-weight="800" font-size="${f.height * 0.5}" fill="${palette(0)}">${escapeXml(String(d?.value ?? ''))}</text>
    <text x="${f.x}" y="${f.y + f.height * 0.85}" font-family="Arial" font-size="${f.height * 0.16}" fill="${palette(1)}">${escapeXml(d?.label ?? '')}</text>
  </g>`;
      }

      // bar chart: rounded bars + labels
      const max = Math.max(...el.data.map((d) => d.value), 1);
      const labelH = Math.min(18, f.height * 0.12);
      const chartH = f.height - labelH - 4;
      const barW = f.width / el.data.length;
      const bars = el.data
        .map((d, i) => {
          const h = Math.max((d.value / max) * chartH, 4);
          const bx = f.x + i * barW + barW * 0.15;
          return `    <rect x="${bx}" y="${f.y + chartH - h}" width="${barW * 0.7}" height="${h}" rx="${Math.min(6, barW * 0.15)}" fill="${palette(i)}"/>
    <text x="${bx + barW * 0.35}" y="${f.y + chartH + labelH}" text-anchor="middle" font-family="Arial" font-size="${labelH * 0.85}" fill="${palette(i)}">${escapeXml(d.label.slice(0, 10))}</text>`;
        })
        .join('\n');
      return `  <g ${common} data-chart="bar">\n${bars}\n  </g>`;
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

  return `  <text ${common} text-anchor="${anchor}" font-family="${escapeXml(fontStack(el.fontFamily))}" font-size="${el.fontSize}" font-weight="${el.fontWeight}" font-style="${el.fontStyle}"${el.letterSpacing ? ` letter-spacing="${el.letterSpacing}"` : ''} fill="${colourToHex(el.colour, doc)}">
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
