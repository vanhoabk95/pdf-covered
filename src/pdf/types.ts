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

/**
 * One text run as extracted from the PDF text layer.
 * All geometry is in PDF user space (points, origin bottom-left).
 */
export interface PdfTextItem {
  id: string;
  pageIndex: number;
  /** Position in PDF.js text content order (content stream order). */
  itemIndex: number;
  /** NFC-normalized text. */
  text: string;

  /** Axis-aligned bounds of the (possibly rotated) glyph run. */
  x: number;
  y: number;
  width: number;
  height: number;

  /** Font size in user space (length of the text matrix's vertical axis). */
  fontSize: number;
  /** Text direction angle in degrees, counter-clockwise, normalized to (-180, 180]. */
  rotation: number;
  /** Baseline origin of the run. */
  baselineX: number;
  baselineY: number;
  /** Advance length along the text direction. */
  advance: number;
  /** Ascent/descent as positive distances from the baseline (user space). */
  ascent: number;
  descent: number;

  dir: "ltr" | "rtl" | "ttb";
  fontName: string;
  hasEOL: boolean;
  transform: Matrix;
  /** "ocr" for text recognized from page images. */
  source?: "text" | "ocr";
  /** 0..1 OCR recognition confidence (spec §23), only for OCR items. */
  ocrConfidence?: number;
}

/** A page geometry projected onto the screen at a given CSS scale. */
export interface ViewportTransform {
  /** Maps PDF user space → CSS pixels relative to the page's top-left corner. */
  transform: Matrix;
  /** Page size in CSS pixels (after rotation). */
  width: number;
  height: number;
}
