import type { BoundingBox, Matrix, PageGeometry, ViewportTransform } from "./types";

/**
 * The single place for PDF ↔ viewport math.
 * Persisted geometry is always in unrotated PDF user space; screen coordinates are derived.
 */

/** CSS pixels per PDF point at 100% zoom (96 dpi / 72 dpi). */
export const CSS_PX_PER_PT = 96 / 72;

export function normalizeRotation(rotation: number): number {
  const r = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  return r;
}

/**
 * Builds the PDF → CSS-pixel transform for a page at `zoom` (1 = 100%).
 * Mirrors PDF.js PageViewport so masks align with the canvas PDF.js renders.
 */
export function createViewportTransform(
  geometry: PageGeometry,
  zoom: number,
  extraRotation = 0,
): ViewportTransform {
  const scale = zoom * CSS_PX_PER_PT * (geometry.userUnit || 1);
  const [x0, y0, x1, y1] = geometry.viewBox;
  const rotation = normalizeRotation(geometry.rotate + extraRotation);
  const centerX = (x0 + x1) / 2;
  const centerY = (y0 + y1) / 2;

  let a: number, b: number, c: number, d: number;
  switch (rotation) {
    case 90:
      [a, b, c, d] = [0, 1, 1, 0];
      break;
    case 180:
      [a, b, c, d] = [-1, 0, 0, 1];
      break;
    case 270:
      [a, b, c, d] = [0, -1, -1, 0];
      break;
    default:
      [a, b, c, d] = [1, 0, 0, -1];
  }

  let offsetX: number, offsetY: number, width: number, height: number;
  if (a === 0) {
    offsetX = Math.abs(centerY - y0) * scale;
    offsetY = Math.abs(centerX - x0) * scale;
    width = Math.abs(y1 - y0) * scale;
    height = Math.abs(x1 - x0) * scale;
  } else {
    offsetX = Math.abs(centerX - x0) * scale;
    offsetY = Math.abs(centerY - y0) * scale;
    width = Math.abs(x1 - x0) * scale;
    height = Math.abs(y1 - y0) * scale;
  }

  const transform: Matrix = [
    a * scale,
    b * scale,
    c * scale,
    d * scale,
    offsetX - a * scale * centerX - c * scale * centerY,
    offsetY - b * scale * centerX - d * scale * centerY,
  ];
  return { transform, width, height };
}

export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function invertMatrix(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2];
  if (det === 0) throw new Error("Matrix is not invertible");
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

export function multiplyMatrix(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/** Axis-aligned bounds of a box after transforming its four corners. */
export function transformBox(m: Matrix, box: BoundingBox): BoundingBox {
  const corners = [
    applyMatrix(m, box.x, box.y),
    applyMatrix(m, box.x + box.width, box.y),
    applyMatrix(m, box.x, box.y + box.height),
    applyMatrix(m, box.x + box.width, box.y + box.height),
  ];
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/** PDF user-space box (origin bottom-left) → CSS-pixel box (origin page top-left). */
export function pdfBoxToViewport(box: BoundingBox, vt: ViewportTransform): BoundingBox {
  return transformBox(vt.transform, box);
}

/** CSS-pixel box → PDF user-space box. */
export function viewportBoxToPdf(box: BoundingBox, vt: ViewportTransform): BoundingBox {
  return transformBox(invertMatrix(vt.transform), box);
}

export function viewportPointToPdf(x: number, y: number, vt: ViewportTransform): [number, number] {
  return applyMatrix(invertMatrix(vt.transform), x, y);
}

/** PDF box → normalized page coordinates (0..1, origin top-left of the rotated page). */
export function pdfBoxToNormalized(box: BoundingBox, geometry: PageGeometry): BoundingBox {
  const vt = createViewportTransform(geometry, 1);
  const v = pdfBoxToViewport(box, vt);
  return { x: v.x / vt.width, y: v.y / vt.height, width: v.width / vt.width, height: v.height / vt.height };
}
