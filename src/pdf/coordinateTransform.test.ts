import { describe, expect, it } from "vitest";
import {
  applyMatrix,
  createViewportTransform,
  CSS_PX_PER_PT,
  invertMatrix,
  multiplyMatrix,
  normalizeRotation,
  pdfBoxToNormalized,
  pdfBoxToViewport,
  viewportBoxToPdf,
  viewportPointToPdf,
} from "./coordinateTransform";
import type { BoundingBox, PageGeometry } from "./types";

const letter: PageGeometry = { viewBox: [0, 0, 612, 792], rotate: 0, userUnit: 1 };

function expectBoxClose(actual: BoundingBox, expected: BoundingBox) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.width).toBeCloseTo(expected.width, 6);
  expect(actual.height).toBeCloseTo(expected.height, 6);
}

describe("normalizeRotation", () => {
  it.each([
    [0, 0],
    [90, 90],
    [-90, 270],
    [450, 90],
    [720, 0],
    [180, 180],
  ])("%i → %i", (input, expected) => {
    expect(normalizeRotation(input)).toBe(expected);
  });
});

describe("createViewportTransform", () => {
  it("maps PDF origin (bottom-left) to CSS bottom-left at rotation 0", () => {
    const vt = createViewportTransform(letter, 1);
    expect(vt.width).toBeCloseTo(612 * CSS_PX_PER_PT);
    expect(vt.height).toBeCloseTo(792 * CSS_PX_PER_PT);
    const [x, y] = applyMatrix(vt.transform, 0, 0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(vt.height);
    const [tx, ty] = applyMatrix(vt.transform, 0, 792);
    expect(tx).toBeCloseTo(0);
    expect(ty).toBeCloseTo(0);
  });

  it("swaps width and height for 90° pages", () => {
    const vt = createViewportTransform({ ...letter, rotate: 90 }, 1);
    expect(vt.width).toBeCloseTo(792 * CSS_PX_PER_PT);
    expect(vt.height).toBeCloseTo(612 * CSS_PX_PER_PT);
    // Rotated 90° clockwise: PDF bottom-left lands at CSS top-left.
    const [x, y] = applyMatrix(vt.transform, 0, 0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
  });

  it("accounts for a non-zero view box origin", () => {
    const g: PageGeometry = { viewBox: [100, 50, 400, 450], rotate: 0, userUnit: 1 };
    const vt = createViewportTransform(g, 2);
    const [x, y] = applyMatrix(vt.transform, 100, 450);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    expect(vt.width).toBeCloseTo(300 * 2 * CSS_PX_PER_PT);
  });

  it("scales with userUnit", () => {
    const vt = createViewportTransform({ ...letter, userUnit: 2 }, 1);
    expect(vt.width).toBeCloseTo(612 * 2 * CSS_PX_PER_PT);
  });
});

describe("box conversion", () => {
  const box: BoundingBox = { x: 72, y: 700, width: 200, height: 14 };

  it.each([0, 90, 180, 270])("round-trips PDF → viewport → PDF at rotation %i", (rotate) => {
    for (const zoom of [0.5, 1, 1.75, 4]) {
      const vt = createViewportTransform({ ...letter, rotate }, zoom);
      expectBoxClose(viewportBoxToPdf(pdfBoxToViewport(box, vt), vt), box);
    }
  });

  it("stays proportional under zoom (masks don't drift)", () => {
    const a = pdfBoxToViewport(box, createViewportTransform(letter, 1));
    const b = pdfBoxToViewport(box, createViewportTransform(letter, 3));
    expectBoxClose(b, { x: a.x * 3, y: a.y * 3, width: a.width * 3, height: a.height * 3 });
  });

  it("places a top-of-page line near the top of the viewport", () => {
    const vt = createViewportTransform(letter, 1);
    const v = pdfBoxToViewport(box, vt);
    expect(v.y).toBeCloseTo((792 - 714) * CSS_PX_PER_PT);
    expect(v.x).toBeCloseTo(72 * CSS_PX_PER_PT);
  });

  it("converts viewport points back to PDF space", () => {
    const vt = createViewportTransform({ ...letter, rotate: 270 }, 1.5);
    const [vx, vy] = applyMatrix(vt.transform, 300, 400);
    const [x, y] = viewportPointToPdf(vx, vy, vt);
    expect(x).toBeCloseTo(300);
    expect(y).toBeCloseTo(400);
  });

  it("normalizes to 0..1 page coordinates", () => {
    const n = pdfBoxToNormalized({ x: 0, y: 0, width: 612, height: 792 }, letter);
    expectBoxClose(n, { x: 0, y: 0, width: 1, height: 1 });
  });
});

describe("matrix helpers", () => {
  it("inverse × matrix = identity", () => {
    const m = createViewportTransform({ ...letter, rotate: 90 }, 2).transform;
    const id = multiplyMatrix(m, invertMatrix(m));
    [1, 0, 0, 1, 0, 0].forEach((v, i) => expect(id[i]).toBeCloseTo(v));
  });
});
