interface DesignCanvasPlaceholderProps {
  /** Rendered SVG string for the active page. */
  svg: string | null;
  pageLabel?: string;
  /** When false, direct manipulation is hidden until the user signs in. */
  canDirectEdit: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
}

/**
 * Canvas area until Agent 3's Konva DesignCanvas lands.
 * Shows a large live SVG preview; edit affordances require auth.
 */
export function DesignCanvasPlaceholder({
  svg,
  pageLabel,
  canDirectEdit,
  canvasWidth,
  canvasHeight,
}: DesignCanvasPlaceholderProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Canvas {pageLabel ? `· ${pageLabel}` : ''}
        </span>
        {canDirectEdit ? (
          <span className="text-xs text-slate-400">Direct edit canvas coming soon</span>
        ) : (
          <span className="text-xs text-amber-700">Sign in to unlock direct editing</span>
        )}
      </div>
      <div className="flex flex-1 items-start justify-center overflow-auto p-6">
        {svg ? (
          <div
            className="max-w-full overflow-hidden rounded-lg border border-slate-300 bg-white shadow-md [&_svg]:h-auto [&_svg]:max-w-full"
            style={
              canvasWidth && canvasHeight
                ? { maxWidth: Math.min(canvasWidth, 720) }
                : undefined
            }
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="flex h-64 w-full max-w-lg items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-400">
            No preview yet — adjust recipe slots or compose with AI
          </div>
        )}
      </div>
    </div>
  );
}
