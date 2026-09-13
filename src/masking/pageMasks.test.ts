import { describe, expect, it } from "vitest";
import type { DetectionResult } from "../detection/types";
import { groupLines } from "../grouping/lineGrouper";
import { makeItem } from "../grouping/testItems";
import type { PageGeometry } from "../pdf/types";
import { DEFAULT_MASK_PADDING } from "./maskGenerator";
import { resolvePageMasks } from "./pageMasks";
import { DEFAULT_THRESHOLDS } from "./thresholds";
import type { MaskRegion } from "./types";

const geometry: PageGeometry = { viewBox: [0, 0, 612, 792], rotate: 0, userUnit: 1 };

// Three 12pt lines on 11pt leading: Vietnamese, Vietnamese, English.
const lines = groupLines([
  makeItem({ text: "Người phụ trách", x: 72, y: 700, size: 12 }),
  makeItem({ text: "Kiểm tra trước khi chạy", x: 72, y: 689, size: 12 }),
  makeItem({ text: "Target luminance", x: 72, y: 678, size: 12 }),
]);
const confidences = [0.99, 0.98, 0.02];
const detections: DetectionResult[] = lines.map((l, i) => ({
  lineId: l.id,
  detector: "language:vi",
  language: "vi",
  confidence: confidences[i],
  signals: {},
}));

function resolve(overrides: Record<string, "confirmed" | "ignored"> = {}, manual: MaskRegion[] = [], thresholds = DEFAULT_THRESHOLDS) {
  return resolvePageMasks({
    pageIndex: 0,
    content: { lines, detections },
    geometry,
    overrides,
    manual,
    revealed: {},
    padding: DEFAULT_MASK_PADDING,
    thresholds,
  });
}

const byText = (masks: MaskRegion[], text: string) => masks.find((m) => m.sourceText === text)!;

describe("resolvePageMasks", () => {
  it("lets two masked neighbours overlap (no exposed diacritics between them)", () => {
    const masks = resolve();
    const upper = byText(masks, "Người phụ trách");
    const lower = byText(masks, "Kiểm tra trước khi chạy");
    const upperLine = lines[0];
    // Upper mask keeps its full padded extent downward.
    expect(upper.bbox.y).toBeCloseTo(upperLine.bbox.y - DEFAULT_MASK_PADDING.y);
    expect(lower.bbox.y + lower.bbox.height).toBeGreaterThan(upper.bbox.y);
  });

  it("still protects a visible English line", () => {
    const lower = byText(resolve(), "Kiểm tra trước khi chạy");
    const englishCapTop = 678 + 0.75 * 12; // 687
    const ownDescender = 689 - 0.22 * 12; // 686.36 — reaches into the English caps, so split
    expect(lower.bbox.y).toBeCloseTo((englishCapTop + ownDescender) / 2, 5);
  });

  it("clips again when a neighbour becomes visible (ignored or below threshold)", () => {
    const upperFull = byText(resolve(), "Người phụ trách");
    const lowerKey = byText(resolve(), "Kiểm tra trước khi chạy").key;
    const upperClipped = byText(resolve({ [lowerKey]: "ignored" }), "Người phụ trách");
    expect(upperClipped.bbox.y).toBeGreaterThan(upperFull.bbox.y);

    const strict = byText(resolve({}, [], { ...DEFAULT_THRESHOLDS, auto: 0.985 }), "Người phụ trách");
    expect(strict.bbox.y).toBeGreaterThan(upperFull.bbox.y);
  });

  it("protects a visible line above only down to its baseline", () => {
    // English baseline 709 sits inside the Vietnamese line's padded box (top ≈ 710.6).
    const above = groupLines([
      makeItem({ text: "Target luminance", x: 72, y: 709, size: 12 }),
      makeItem({ text: "Người phụ trách", x: 72, y: 700, size: 12 }),
    ]);
    const result = resolvePageMasks({
      pageIndex: 0,
      content: {
        lines: above,
        detections: above.map((l) => ({ ...detections[0], lineId: l.id, confidence: l.text.startsWith("Target") ? 0.02 : 0.99 })),
      },
      geometry,
      overrides: {},
      manual: [],
      revealed: {},
      padding: DEFAULT_MASK_PADDING,
      thresholds: DEFAULT_THRESHOLDS,
    });
    const vi = byText(result, "Người phụ trách");
    // Covers up to the English baseline (English descenders may be covered, its letters are not).
    expect(vi.bbox.y + vi.bbox.height).toBeCloseTo(709, 5);
  });

  it("appends manual masks for the page", () => {
    const manual: MaskRegion = {
      id: "m",
      key: "manual-1",
      pageIndex: 0,
      bbox: { x: 1, y: 1, width: 10, height: 10 },
      sourceText: "",
      detector: "manual",
      language: "und",
      confidence: 1,
      status: "manual",
      visible: true,
    };
    expect(resolve({}, [manual, { ...manual, key: "other-page", pageIndex: 3 }]).map((m) => m.key)).toContain("manual-1");
    expect(resolve({}, [manual, { ...manual, key: "other-page", pageIndex: 3 }]).map((m) => m.key)).not.toContain("other-page");
  });
});
