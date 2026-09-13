import { describe, expect, it } from "vitest";
import { boxFromEdges, clampBox, intersectBoxes, overlapRatio, padBox, roundBox, unionBoxes } from "./bbox";

describe("bbox", () => {
  it("builds boxes from unordered edges", () => {
    expect(boxFromEdges(10, 20, 0, 5)).toEqual({ x: 0, y: 5, width: 10, height: 15 });
  });

  it("unions boxes", () => {
    expect(
      unionBoxes([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 5, y: -5, width: 10, height: 5 },
      ]),
    ).toEqual({ x: 0, y: -5, width: 15, height: 15 });
    expect(unionBoxes([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("pads symmetrically and never goes negative", () => {
    expect(padBox({ x: 10, y: 10, width: 20, height: 8 }, 2, 1)).toEqual({ x: 8, y: 9, width: 24, height: 10 });
    expect(padBox({ x: 0, y: 0, width: 2, height: 2 }, -5, -5).width).toBe(0);
  });

  it("intersects and measures overlap", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 5, width: 10, height: 10 };
    expect(intersectBoxes(a, b)).toEqual({ x: 5, y: 5, width: 5, height: 5 });
    expect(intersectBoxes(a, { x: 20, y: 20, width: 1, height: 1 })).toBeNull();
    expect(overlapRatio(a, b)).toBeCloseTo(0.25);
    expect(overlapRatio(a, { x: 2, y: 2, width: 2, height: 2 })).toBe(1);
  });

  it("clamps to page bounds and rounds", () => {
    const page = { x: 0, y: 0, width: 612, height: 792 };
    expect(clampBox({ x: -5, y: 780, width: 50, height: 30 }, page)).toEqual({ x: 0, y: 780, width: 45, height: 12 });
    expect(roundBox({ x: 1.23456, y: 2, width: 3.999, height: 0.005 })).toEqual({ x: 1.23, y: 2, width: 4, height: 0.01 });
  });
});
