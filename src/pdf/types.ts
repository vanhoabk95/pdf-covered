/** Axis-aligned box. Unit and origin depend on context (see the type using it). */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Static geometry of a PDF page, independent of zoom and screen.
 * `viewBox` is [x0, y0, x1, y1] in PDF user space (points, origin bottom-left),
 * i.e. PDF.js `page.view` (the crop box).
 */
export interface PageGeometry {
  viewBox: [number, number, number, number];
  /** Page /Rotate, normalized to 0 | 90 | 180 | 270. */
  rotate: number;
  userUnit: number;
}

/** 2D affine matrix [a, b, c, d, e, f] (same convention as PDF / PDF.js). */
export type Matrix = [number, number, number, number, number, number];

/** A page geometry projected onto the screen at a given CSS scale. */
export interface ViewportTransform {
  /** Maps PDF user space → CSS pixels relative to the page's top-left corner. */
  transform: Matrix;
  /** Page size in CSS pixels (after rotation). */
  width: number;
  height: number;
}
