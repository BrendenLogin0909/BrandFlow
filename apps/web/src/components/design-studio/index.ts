/**
 * Design Studio — public surface for the shell, canvas, and helpers.
 */
export { DesignCanvasPlaceholder } from './DesignCanvasPlaceholder';
export { DesignPageTabs } from './DesignPageTabs';
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
