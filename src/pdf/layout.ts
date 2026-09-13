import { createViewportTransform } from "./coordinateTransform";
import type { PageGeometry } from "./types";

/** Pure layout math for the vertical page list. All values in CSS pixels. */

export const PAGE_GAP = 16;
export const PAGE_MARGIN = 24;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 6;
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6];

export type FitMode = "width" | "page";

export interface PageSlot {
  pageIndex: number;
  top: number;
  width: number;
  height: number;
}

export interface DocumentLayout {
  slots: PageSlot[];
  totalHeight: number;
  maxWidth: number;
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function nextZoomStep(zoom: number, direction: 1 | -1): number {
  const eps = 1e-3;
  if (direction > 0) return ZOOM_STEPS.find((z) => z > zoom + eps) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((z) => z < zoom - eps) ?? MIN_ZOOM;
}

export function computeLayout(geometries: PageGeometry[], zoom: number): DocumentLayout {
  let top = PAGE_MARGIN;
  let maxWidth = 0;
  const slots = geometries.map((g, pageIndex) => {
    const { width, height } = createViewportTransform(g, zoom);
    const slot = { pageIndex, top, width, height };
    top += height + PAGE_GAP;
    maxWidth = Math.max(maxWidth, width);
    return slot;
  });
  const totalHeight = slots.length ? top - PAGE_GAP + PAGE_MARGIN : 0;
  return { slots, totalHeight, maxWidth };
}

/**
 * Zoom that fits the reference page into the container.
 * "width" uses the widest page so no page overflows horizontally.
 */
export function computeFitZoom(
  mode: FitMode,
  geometries: PageGeometry[],
  referencePage: number,
  container: { width: number; height: number },
): number {
  if (!geometries.length || container.width <= 0 || container.height <= 0) return 1;
  const availW = container.width - PAGE_MARGIN * 2;
  const availH = container.height - PAGE_MARGIN * 2;
  if (mode === "width") {
    const widest = Math.max(...geometries.map((g) => createViewportTransform(g, 1).width));
    return clampZoom(availW / widest);
  }
  const g = geometries[Math.min(Math.max(referencePage, 0), geometries.length - 1)];
  const { width, height } = createViewportTransform(g, 1);
  return clampZoom(Math.min(availW / width, availH / height));
}

/** Index of the first slot whose bottom edge is below `y` (binary search). */
function firstSlotEndingAfter(slots: PageSlot[], y: number): number {
  let lo = 0;
  let hi = slots.length - 1;
  let ans = slots.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (slots[mid].top + slots[mid].height >= y) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans;
}

/** Pages intersecting the scroll viewport, expanded by `overscan` pages each side. */
export function visiblePageRange(
  layout: DocumentLayout,
  scrollTop: number,
  viewportHeight: number,
  overscan = 1,
): { start: number; end: number } {
  const { slots } = layout;
  if (!slots.length) return { start: 0, end: -1 };
  const first = firstSlotEndingAfter(slots, scrollTop);
  let last = first;
  const bottom = scrollTop + viewportHeight;
  while (last + 1 < slots.length && slots[last + 1].top <= bottom) last++;
  return { start: Math.max(0, first - overscan), end: Math.min(slots.length - 1, last + overscan) };
}

/** The page considered "current": the one crossing a line one third down the viewport. */
export function currentPageAt(layout: DocumentLayout, scrollTop: number, viewportHeight: number): number {
  if (!layout.slots.length) return 0;
  return firstSlotEndingAfter(layout.slots, scrollTop + viewportHeight / 3);
}

/** Scroll anchor used to keep the same content in view when zoom changes. */
export interface ScrollAnchor {
  pageIndex: number;
  /** Fraction (0..1) of the page height at the top of the viewport. */
  offsetRatio: number;
}

export function anchorFromScroll(layout: DocumentLayout, scrollTop: number): ScrollAnchor {
  if (!layout.slots.length) return { pageIndex: 0, offsetRatio: 0 };
  const idx = firstSlotEndingAfter(layout.slots, scrollTop);
  const slot = layout.slots[idx];
  return { pageIndex: idx, offsetRatio: slot.height ? (scrollTop - slot.top) / slot.height : 0 };
}

export function scrollFromAnchor(layout: DocumentLayout, anchor: ScrollAnchor): number {
  const slot = layout.slots[anchor.pageIndex];
  if (!slot) return 0;
  return Math.max(0, slot.top + anchor.offsetRatio * slot.height);
}
