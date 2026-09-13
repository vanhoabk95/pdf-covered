import type { ViewportTransform } from "../pdf/types";

interface MaskOverlayProps {
  pageIndex: number;
  viewport: ViewportTransform;
}

/**
 * Independent mask layer above the canvas. Regions are stored in PDF user space and
 * projected with `viewport` on every render, so zoom/resize never misaligns them.
 * Mask regions are wired in Phase D.
 */
export function MaskOverlay({ pageIndex, viewport }: MaskOverlayProps) {
  return (
    <svg
      className="mask-layer"
      width={viewport.width}
      height={viewport.height}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      data-page-index={pageIndex}
      aria-hidden
    />
  );
}
