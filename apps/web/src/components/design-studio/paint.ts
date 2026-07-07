/**
 * Fill → Konva paint props. Reuses `resolveColour` from design-schema (the same
 * token→hex resolution the SVG exporter uses) so a colour looks identical on the
 * canvas and in the exported SVG. We only add the Konva-specific plumbing:
 * gradients become `fillLinearGradient*` props, image fills fall back to a
 * neutral placeholder (real image fills are handled by the Image element).
 */
import type { Colour, Fill, InternalDesignDocument } from '@brandflow/design-schema';
import { resolveColour } from '@brandflow/design-schema';

const IMAGE_FILL_PLACEHOLDER = '#e5e7eb';

/** Konva Shape fill props for any schema Fill. Solid colour uses `fill`;
 *  gradients use the linear-gradient props relative to the node's local box. */
export function fillProps(
  fill: Fill,
  doc: InternalDesignDocument,
  box: { width: number; height: number },
): {
  fill?: string;
  fillLinearGradientStartPoint?: { x: number; y: number };
  fillLinearGradientEndPoint?: { x: number; y: number };
  fillLinearGradientColorStops?: Array<number | string>;
} {
  if ('kind' in fill && (fill.kind === 'token' || fill.kind === 'raw')) {
    return { fill: colourHex(fill, doc) };
  }
  if (fill.kind === 'gradient') {
    // Match the SVG exporter's angle convention: 0° points up, growing
    // clockwise. Map that to start/end points on the node's local box.
    const rad = ((fill.angle - 90) * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const cx = box.width / 2;
    const cy = box.height / 2;
    const hx = (dx * box.width) / 2;
    const hy = (dy * box.height) / 2;
    const stops: Array<number | string> = [];
    for (const s of fill.stops) {
      stops.push(s.at, colourHex(s.colour, doc));
    }
    return {
      fillLinearGradientStartPoint: { x: cx - hx, y: cy - hy },
      fillLinearGradientEndPoint: { x: cx + hx, y: cy + hy },
      fillLinearGradientColorStops: stops,
    };
  }
  // imageFill — the Image element renders real pixels; as a shape fill we show
  // a neutral placeholder (mirrors the exporter's #ffffff/asset-swap behaviour).
  return { fill: IMAGE_FILL_PLACEHOLDER };
}

/** Resolve a schema Colour to a hex string, defaulting to black like the
 *  exporter (`colourToHex`). */
export function colourHex(colour: Colour, doc: InternalDesignDocument): string {
  return resolveColour(colour, doc) ?? '#000000';
}
