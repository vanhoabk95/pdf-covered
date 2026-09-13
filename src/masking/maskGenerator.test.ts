import { describe, expect, it } from "vitest";
import type { DetectionResult } from "../detection/types";
import { groupLines } from "../grouping/lineGrouper";
import { makeItem } from "../grouping/testItems";
import type { PageGeometry } from "../pdf/types";
import {
  applyOverride,
  effectiveTier,
  generateMasks,
  isRedactable,
  maskDisplay,
  regionKey,
} from "./maskGenerator";
import { DEFAULT_THRESHOLDS } from "./thresholds";

const page: PageGeometry = { viewBox: [0, 0, 612, 792], rotate: 0, userUnit: 1 };

const detect = (lineId: string, confidence: number): DetectionResult => ({
  lineId,
  detector: "language:vi",
  language: confidence >= 0.5 ? "vi" : "en",
  confidence,
  signals: {},
});

function setup(specs: Parameters<typeof makeItem>[0][], confidences: number[]) {
  const lines = groupLines(specs.map(makeItem));
  const detections = lines.map((l, i) => detect(l.id, confidences[i]));
  return { lines, masks: generateMasks({ pageIndex: 0, geometry: page, lines, detections }) };
}

describe("generateMasks", () => {
  it("pads the line box in PDF points", () => {
    const { lines, masks } = setup([{ text: "Mục tiêu dự án", x: 72, y: 700, size: 12 }], [0.99]);
    const [mask] = masks;
    expect(mask.bbox.x).toBeCloseTo(lines[0].bbox.x - 2);
    expect(mask.bbox.width).toBeCloseTo(lines[0].bbox.width + 4);
    expect(mask.bbox.y).toBeCloseTo(lines[0].bbox.y - 1);
    expect(mask.bbox.height).toBeCloseTo(lines[0].bbox.height + 2);
    expect(mask).toMatchObject({ status: "auto", visible: true, sourceText: "Mục tiêu dự án", lineId: lines[0].id });
    expect(mask.itemIds).toEqual(lines[0].itemIds);
  });

  it("creates a candidate for every detection (tiers decided later)", () => {
    const { masks } = setup(
      [
        { text: "Project Overview", x: 72, y: 700 },
        { text: "Mục tiêu", x: 72, y: 600 },
      ],
      [0.03, 0.99],
    );
    expect(masks).toHaveLength(2);
  });

  it("clamps to the page", () => {
    const { masks } = setup([{ text: "Lề trái", x: 0.5, y: 785, size: 12 }], [0.99]);
    expect(masks[0].bbox.x).toBe(0);
    expect(masks[0].bbox.y + masks[0].bbox.height).toBeLessThanOrEqual(792);
  });

  it("does not cover glyph cores of an adjacent line with tight leading", () => {
    // 12pt text on 10pt leading: Vietnamese line above an English line.
    const vi = { text: "Người phụ trách", x: 72, y: 700, size: 12 };
    const en = { text: "Target luminance", x: 72, y: 690, size: 12 };
    const { lines, masks } = setup([vi, en], [0.99, 0.02]);
    const viMask = masks.find((m) => m.sourceText === vi.text)!;
    const enLine = lines.find((l) => l.text === en.text)!;
    const enCapTop = 690 + 0.75 * 12; // 699
    const viDescender = 700 - 0.22 * 12; // 697.36
    expect(enLine.bbox.y + enLine.bbox.height).toBeGreaterThan(viMask.bbox.y + 1); // boxes did overlap
    // Cores overlap here, so the mask edge sits at their midpoint…
    expect(viMask.bbox.y).toBeCloseTo((enCapTop + viDescender) / 2, 5);
    // …but everything above the Vietnamese baseline stays covered.
    expect(viMask.bbox.y).toBeLessThanOrEqual(700);
    expect(viMask.bbox.y + viMask.bbox.height).toBeGreaterThanOrEqual(700 + 0.75 * 12);
  });

  it("stops at the neighbour's cap height when cores don't overlap", () => {
    // 12pt text on 12pt leading: padded boxes overlap but glyph cores don't.
    const { masks } = setup(
      [
        { text: "Người phụ trách", x: 72, y: 700, size: 12 },
        { text: "Target luminance", x: 72, y: 688, size: 12 },
      ],
      [0.99, 0.02],
    );
    expect(masks[0].bbox.y).toBeCloseTo(688 + 0.75 * 12, 5);
  });

  it("keeps full padding when neighbours are far away", () => {
    const { lines, masks } = setup(
      [
        { text: "Dòng một", x: 72, y: 700, size: 12 },
        { text: "Line two", x: 72, y: 670, size: 12 },
      ],
      [0.99, 0.01],
    );
    const viLine = lines.find((l) => l.text === "Dòng một")!;
    expect(masks[0].bbox.y).toBeCloseTo(viLine.bbox.y - 1);
  });

  it("splits the gap with a close column on the same row", () => {
    const left = { text: "Độ sáng", x: 72, y: 600, size: 12, advance: 48 };
    const right = { text: "Brightness", x: 138.5, y: 600, size: 12, advance: 60 }; // 18.5pt gap (> 1.5em → separate lines)
    const { masks } = setup([left, right], [0.99, 0.02]);
    const viMask = masks.find((m) => m.sourceText === "Độ sáng")!;
    expect(viMask.bbox.x + viMask.bbox.width).toBeLessThanOrEqual(138.5);
  });

  it("produces stable keys independent of line ids", () => {
    const a = setup([{ text: "Mục tiêu", x: 72, y: 700 }], [0.99]).masks[0];
    const b = setup([{ text: "Mục tiêu", x: 72.2, y: 700.3 }], [0.97]).masks[0];
    expect(a.key).toBe(b.key);
    expect(regionKey(0, { x: 1, y: 2, width: 3, height: 4 }, "a")).not.toBe(regionKey(0, { x: 1, y: 2, width: 3, height: 4 }, "b"));
    expect(regionKey(1, { x: 1, y: 2, width: 3, height: 4 }, "a")).not.toBe(regionKey(0, { x: 1, y: 2, width: 3, height: 4 }, "a"));
  });
});

describe("tiers, overrides and display", () => {
  const base = setup([{ text: "Kiểm tra", x: 72, y: 700 }], [0.7]).masks[0];

  it("uses confidence tiers for auto masks", () => {
    expect(effectiveTier(base, DEFAULT_THRESHOLDS)).toBe("uncertain");
    expect(effectiveTier(base, { ...DEFAULT_THRESHOLDS, auto: 0.65 })).toBe("auto");
    expect(maskDisplay(base, DEFAULT_THRESHOLDS, true)).toBe("uncertain");
    expect(maskDisplay(base, DEFAULT_THRESHOLDS, false)).toBe("hidden");
  });

  it("confirmed masks are solid and redactable regardless of confidence", () => {
    const confirmed = applyOverride(base, "confirmed", false);
    expect(maskDisplay(confirmed, DEFAULT_THRESHOLDS, false)).toBe("solid");
    expect(isRedactable(confirmed, DEFAULT_THRESHOLDS)).toBe(true);
  });

  it("ignored masks are hidden and never redacted", () => {
    const strong = { ...base, confidence: 0.99 };
    const ignored = applyOverride(strong, "ignored", false);
    expect(maskDisplay(ignored, DEFAULT_THRESHOLDS, true)).toBe("hidden");
    expect(isRedactable(ignored, DEFAULT_THRESHOLDS)).toBe(false);
  });

  it("revealing shows the original but keeps the region redactable", () => {
    const strong = applyOverride({ ...base, confidence: 0.99 }, undefined, true);
    expect(strong.visible).toBe(false);
    expect(maskDisplay(strong, DEFAULT_THRESHOLDS, false)).toBe("revealed");
    expect(isRedactable(strong, DEFAULT_THRESHOLDS)).toBe(true);
  });

  it("uncertain regions are not redacted unless confirmed (spec §42)", () => {
    expect(isRedactable(base, DEFAULT_THRESHOLDS)).toBe(false);
  });

  it("manual masks ignore overrides", () => {
    const manual = { ...base, status: "manual" as const, confidence: 1 };
    expect(applyOverride(manual, "ignored", false).status).toBe("manual");
  });
});
