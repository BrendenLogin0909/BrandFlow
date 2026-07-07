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
export { ValidationPanel } from './ValidationPanel';
export type { ValidationPanelProps } from './ValidationPanel';
export type { DesignStudioBindings } from './studio-props';
export { activePageFromBindings } from './studio-props';
export { PropertyInspector } from './PropertyInspector';
export type { PropertyInspectorProps } from './PropertyInspector';
export { LayersPanel } from './LayersPanel';
export { BrandColourPicker } from './BrandColourPicker';
export type { BrandColourPickerProps } from './BrandColourPicker';
