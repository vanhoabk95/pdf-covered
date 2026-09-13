import { describe, expect, it } from "vitest";
import { createViewportTransform, CSS_PX_PER_PT, pdfBoxToViewport } from "../pdf/coordinateTransform";
import type { PageGeometry } from "../pdf/types";
import { MIN_LINE_CONFIDENCE, ocrLinesToTextLines } from "./ocrToLines";
import type { OcrLine } from "./types";

const geometry: PageGeometry = { viewBox: [0, 0, 612, 792], rotate: 0, userUnit: 1 };
const scale = 300 / 72;
const pdfToImage = createViewportTransform(geometry, scale / CSS_PX_PER_PT).transform;

const line = (patch: Partial<OcrLine> = {}): OcrLine => ({
  text: "Kiểm tra gamma value",
  bbox: { x0: 300, y0: 400, x1: 1100, y1: 460 },
  baseline: { x0: 300, y0: 448, x1: 1100, y1: 448 },
  confidence: 0.93,
  words: [
    { text: "Kiểm", bbox: { x0: 300, y0: 400, x1: 480, y1: 460 }, confidence: 0.95 },
    { text: "tra", bbox: { x0: 500, y0: 405, x1: 600, y1: 450 }, confidence: 0.94 },
    { text: "gamma", bbox: { x0: 620, y0: 410, x1: 860, y1: 460 }, confidence: 0.92 },
    { text: "value", bbox: { x0: 880, y0: 405, x1: 1100, y1: 450 }, confidence: 0.91 },
  ],
  ...patch,
});

describe("ocrLinesToTextLines", () => {
  it("maps image pixels to PDF user space that re-projects onto the image", () => {
    const [result] = ocrLinesToTextLines(3, [line()], pdfToImage);
    expect(result.text).toBe("Kiểm tra gamma value");
    expect(result.pageIndex).toBe(3);
    expect(result.items).toHaveLength(4);
    expect(result.ocrConfidence).toBeCloseTo(0.93);
    expect(result.items[0]).toMatchObject({ source: "ocr", ocrConfidence: 0.95, text: "Kiểm" });

    const back = pdfBoxToViewport(result.bbox, { transform: pdfToImage, width: 0, height: 0 });
    expect(back.x).toBeCloseTo(300, 3);
    expect(back.y).toBeCloseTo(400, 3);
    expect(back.width).toBeCloseTo(800, 3);
    expect(back.height).toBeCloseTo(60, 3);
  });

  it("places the baseline and font metrics in PDF units", () => {
    const [result] = ocrLinesToTextLines(0, [line()], pdfToImage);
    const pxPerPt = scale;
    expect(result.items[0].baselineY).toBeCloseTo(792 - 448 / pxPerPt, 3);
    expect(result.rotation).toBe(0);
    expect(result.fontSize).toBeCloseTo(48 / 0.75 / pxPerPt, 3);
  });

  it("derives rotation for rotated pages", () => {
    const rotated = { ...geometry, rotate: 90 };
    const t = createViewportTransform(rotated, scale / CSS_PX_PER_PT).transform;
    const [result] = ocrLinesToTextLines(0, [line()], t);
    expect(Math.abs(result.rotation)).toBeCloseTo(90);
  });

  it("drops empty, symbol-only and low-confidence lines; normalizes text", () => {
    const lines = ocrLinesToTextLines(
      0,
      [
        line({ text: "   " }),
        line({ text: "— · —" }),
        line({ text: "noise", confidence: MIN_LINE_CONFIDENCE - 0.01 }),
        line({ text: "Mục  tiêu\n", words: [] }),
      ],
      pdfToImage,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Mục tiêu");
    expect(lines[0].items).toHaveLength(1);
  });
});
