import { describe, expect, it } from "vitest";
import { createViewportTransform, pdfBoxToViewport } from "../pdf/coordinateTransform";
import type { PageGeometry } from "../pdf/types";
import { createManualMask } from "./manualMask";

const geometry: PageGeometry = { viewBox: [0, 0, 612, 792], rotate: 0, userUnit: 1 };

describe("createManualMask", () => {
  it("converts a viewport drag into a PDF-space mask that re-projects exactly at any zoom", () => {
    const vt = createViewportTransform(geometry, 1.5);
    const mask = createManualMask(2, { x: 300, y: 100 }, { x: 150, y: 160 }, vt, geometry)!;
    expect(mask).toMatchObject({ pageIndex: 2, status: "manual", detector: "manual", confidence: 1 });
    const back = pdfBoxToViewport(mask.bbox, vt);
    expect(back.x).toBeCloseTo(150);
    expect(back.y).toBeCloseTo(100);
    expect(back.width).toBeCloseTo(150);
    expect(back.height).toBeCloseTo(60);

    const at3 = pdfBoxToViewport(mask.bbox, createViewportTransform(geometry, 3));
    expect(at3.x).toBeCloseTo(300);
    expect(at3.width).toBeCloseTo(300);
  });

  it("works on rotated pages", () => {
    const rotated = { ...geometry, rotate: 90 };
    const vt = createViewportTransform(rotated, 1);
    const mask = createManualMask(0, { x: 10, y: 20 }, { x: 110, y: 50 }, vt, rotated)!;
    const back = pdfBoxToViewport(mask.bbox, vt);
    expect(back.x).toBeCloseTo(10);
    expect(back.width).toBeCloseTo(100);
  });

  it("ignores tiny drags and clamps to the page", () => {
    const vt = createViewportTransform(geometry, 1);
    expect(createManualMask(0, { x: 10, y: 10 }, { x: 12, y: 30 }, vt, geometry)).toBeNull();
    const clamped = createManualMask(0, { x: -50, y: -50 }, { x: 40, y: 40 }, vt, geometry)!;
    expect(clamped.bbox.x).toBe(0);
    expect(clamped.bbox.y + clamped.bbox.height).toBeCloseTo(792);
  });

  it("generates unique keys", () => {
    const vt = createViewportTransform(geometry, 1);
    const a = createManualMask(0, { x: 0, y: 0 }, { x: 50, y: 50 }, vt, geometry)!;
    const b = createManualMask(0, { x: 0, y: 0 }, { x: 50, y: 50 }, vt, geometry)!;
    expect(a.key).not.toBe(b.key);
  });
});
