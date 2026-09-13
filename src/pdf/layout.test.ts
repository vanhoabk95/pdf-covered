import { describe, expect, it } from "vitest";
import { CSS_PX_PER_PT } from "./coordinateTransform";
import {
  anchorFromScroll,
  computeFitZoom,
  computeLayout,
  currentPageAt,
  MAX_ZOOM,
  MIN_ZOOM,
  nextZoomStep,
  PAGE_GAP,
  PAGE_MARGIN,
  scrollFromAnchor,
  visiblePageRange,
} from "./layout";
import type { PageGeometry } from "./types";

const page = (w: number, h: number, rotate = 0): PageGeometry => ({ viewBox: [0, 0, w, h], rotate, userUnit: 1 });
const tenPages = Array.from({ length: 10 }, () => page(612, 792));

describe("computeLayout", () => {
  it("stacks pages with margin and gap", () => {
    const layout = computeLayout(tenPages, 1);
    const h = 792 * CSS_PX_PER_PT;
    expect(layout.slots[0].top).toBe(PAGE_MARGIN);
    expect(layout.slots[1].top).toBeCloseTo(PAGE_MARGIN + h + PAGE_GAP);
    expect(layout.totalHeight).toBeCloseTo(PAGE_MARGIN * 2 + h * 10 + PAGE_GAP * 9);
  });

  it("uses rotated dimensions for landscape pages", () => {
    const layout = computeLayout([page(612, 792, 90)], 1);
    expect(layout.slots[0].width).toBeCloseTo(792 * CSS_PX_PER_PT);
    expect(layout.maxWidth).toBeCloseTo(792 * CSS_PX_PER_PT);
  });

  it("handles empty documents", () => {
    expect(computeLayout([], 1)).toEqual({ slots: [], totalHeight: 0, maxWidth: 0 });
  });
});

describe("zoom", () => {
  it("steps through zoom levels and clamps", () => {
    expect(nextZoomStep(1, 1)).toBe(1.1);
    expect(nextZoomStep(1, -1)).toBe(0.9);
    expect(nextZoomStep(1.05, 1)).toBe(1.1);
    expect(nextZoomStep(1.05, -1)).toBe(1);
    expect(nextZoomStep(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(nextZoomStep(0.2, -1)).toBe(MIN_ZOOM);
  });

  it("fit width uses the widest page", () => {
    const docs = [page(612, 792), page(792, 612)];
    const zoom = computeFitZoom("width", docs, 0, { width: 1000, height: 800 });
    expect(792 * CSS_PX_PER_PT * zoom).toBeCloseTo(1000 - PAGE_MARGIN * 2);
  });

  it("fit page fits both dimensions of the reference page", () => {
    const zoom = computeFitZoom("page", tenPages, 3, { width: 2000, height: 800 });
    expect(792 * CSS_PX_PER_PT * zoom).toBeCloseTo(800 - PAGE_MARGIN * 2);
  });

  it("returns 1 for an unmeasured container", () => {
    expect(computeFitZoom("width", tenPages, 0, { width: 0, height: 0 })).toBe(1);
  });
});

describe("virtualization", () => {
  const layout = computeLayout(tenPages, 1);
  const h = layout.slots[0].height + PAGE_GAP;

  it("returns only pages near the viewport", () => {
    expect(visiblePageRange(layout, 0, 800, 0)).toEqual({ start: 0, end: 0 });
    expect(visiblePageRange(layout, 0, 800, 1)).toEqual({ start: 0, end: 1 });
    const mid = visiblePageRange(layout, h * 5 + 100, 800, 1);
    expect(mid.start).toBe(4);
    expect(mid.end).toBeGreaterThanOrEqual(6);
  });

  it("clamps overscan at the document end", () => {
    const r = visiblePageRange(layout, layout.totalHeight - 400, 400, 2);
    expect(r.end).toBe(9);
  });

  it("detects the current page", () => {
    expect(currentPageAt(layout, 0, 900)).toBe(0);
    expect(currentPageAt(layout, h * 3, 900)).toBe(3);
  });

  it("keeps the scroll anchor across zoom", () => {
    const at1 = computeLayout(tenPages, 1);
    const at2 = computeLayout(tenPages, 2);
    const scrollTop = at1.slots[4].top + at1.slots[4].height * 0.25;
    const anchor = anchorFromScroll(at1, scrollTop);
    expect(anchor.pageIndex).toBe(4);
    expect(anchor.offsetRatio).toBeCloseTo(0.25);
    expect(scrollFromAnchor(at2, anchor)).toBeCloseTo(at2.slots[4].top + at2.slots[4].height * 0.25);
  });
});
