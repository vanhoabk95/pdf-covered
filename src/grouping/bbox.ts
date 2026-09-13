import type { BoundingBox } from "../pdf/types";

export function boxFromEdges(x0: number, y0: number, x1: number, y1: number): BoundingBox {
  const minX = Math.min(x0, x1);
  const minY = Math.min(y0, y1);
  return { x: minX, y: minY, width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
}

export function unionBoxes(boxes: readonly BoundingBox[]): BoundingBox {
  if (!boxes.length) return { x: 0, y: 0, width: 0, height: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width);
    y1 = Math.max(y1, b.y + b.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function padBox(box: BoundingBox, padX: number, padY: number): BoundingBox {
  return {
    x: box.x - padX,
    y: box.y - padY,
    width: Math.max(0, box.width + padX * 2),
    height: Math.max(0, box.height + padY * 2),
  };
}

export function intersectBoxes(a: BoundingBox, b: BoundingBox): BoundingBox | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function boxArea(box: BoundingBox): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

/** Intersection area divided by the smaller box's area (0..1). */
export function overlapRatio(a: BoundingBox, b: BoundingBox): number {
  const inter = intersectBoxes(a, b);
  if (!inter) return 0;
  const smaller = Math.min(boxArea(a), boxArea(b));
  return smaller > 0 ? boxArea(inter) / smaller : 0;
}

/** Clamps a box to lie inside `bounds`. Returns null when nothing remains. */
export function clampBox(box: BoundingBox, bounds: BoundingBox): BoundingBox | null {
  return intersectBoxes(box, bounds);
}

export function roundBox(box: BoundingBox, decimals = 2): BoundingBox {
  const f = 10 ** decimals;
  const r = (n: number) => Math.round(n * f) / f;
  return { x: r(box.x), y: r(box.y), width: r(box.width), height: r(box.height) };
}
