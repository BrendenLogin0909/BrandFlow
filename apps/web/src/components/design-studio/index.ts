/**
 * Design Studio canvas — public surface. The Studio shell imports `DesignCanvas`
 * and the pure frame/snap helpers from here.
 */
export { DesignCanvas } from './DesignCanvas';
export type { DesignCanvasProps } from './DesignCanvas';
export {
  activePage,
  boundingBox,
  findElement,
  isLocked,
  mapElement,
  moveElementBy,
  normaliseFrame,
  normaliseRotation,
  roundPx,
  translateElement,
  updateElementFrame,
  updateElementFrames,
  type FrameTransform,
} from './frame';
export { computeSnap, DEFAULT_SNAP_THRESHOLD, type Box, type SnapGuide } from './snapping';
export { colourHex, fillProps } from './paint';
