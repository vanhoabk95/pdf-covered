import { boxFromEdges, intersectBoxes } from "../grouping/bbox";
import { viewportBoxToPdf } from "../pdf/coordinateTransform";
import type { BoundingBox, PageGeometry, ViewportTransform } from "../pdf/types";
import type { MaskRegion } from "./types";

/** Drags smaller than this (CSS px) are treated as clicks, not masks. */
export const MIN_MANUAL_MASK_PX = 4;

let counter = 0;

/**
 * Creates a manual mask from a drag in page-viewport CSS pixels (spec §36).
 * The mask is stored in PDF user space so it stays aligned at every zoom.
 */
export function createManualMask(
  pageIndex: number,
  start: { x: number; y: number },
  end: { x: number; y: number },
  viewport: ViewportTransform,
  geometry: PageGeometry,
): MaskRegion | null {
  const drag = boxFromEdges(start.x, start.y, end.x, end.y);
  if (drag.width < MIN_MANUAL_MASK_PX || drag.height < MIN_MANUAL_MASK_PX) return null;
  const [x0, y0, x1, y1] = geometry.viewBox;
  const page: BoundingBox = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  const bbox = intersectBoxes(viewportBoxToPdf(drag, viewport), page);
  if (!bbox) return null;
  const key = `manual:${pageIndex}:${Date.now().toString(36)}:${(counter++).toString(36)}`;
  return {
    id: key,
    key,
    pageIndex,
    bbox,
    sourceText: "",
    detector: "manual",
    language: "und",
    confidence: 1,
    status: "manual",
    visible: true,
  };
}
