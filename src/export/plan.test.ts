import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS } from "../masking/thresholds";
import type { MaskRegion } from "../masking/types";
import { exportReadiness, planRedaction, redactedFileName } from "./plan";

const mask = (patch: Partial<MaskRegion>): MaskRegion => ({
  id: "m",
  key: "k",
  pageIndex: 0,
  bbox: { x: 0, y: 0, width: 10, height: 10 },
  sourceText: "text",
  detector: "language:vi",
  language: "vi",
  confidence: 0.99,
  status: "auto",
  visible: true,
  ...patch,
});

describe("planRedaction", () => {
  it("includes auto, confirmed, manual and revealed masks; excludes uncertain, ignored and low confidence", () => {
    const plan = planRedaction(
      [
        [
          mask({ key: "auto" }),
          mask({ key: "revealed", visible: false }),
          mask({ key: "uncertain", confidence: 0.7 }),
          mask({ key: "confirmed", confidence: 0.7, status: "confirmed" }),
          mask({ key: "ignored", status: "ignored" }),
          mask({ key: "english", confidence: 0.02 }),
        ],
        [mask({ key: "manual", pageIndex: 1, status: "manual", sourceText: "" })],
      ],
      DEFAULT_THRESHOLDS,
    );
    expect(plan.regions).toHaveLength(4);
    expect(plan.excludedUncertain).toBe(1);
    expect(plan.regions.map((r) => r.pageIndex)).toEqual([0, 0, 0, 1]);
  });
});

describe("exportReadiness", () => {
  it("requires every page to be processed and reports blockers", () => {
    const r = exportReadiness([
      { state: "ready", noTextLayer: false },
      { state: "detecting", noTextLayer: false },
      { state: "error", noTextLayer: false },
      { state: "ready", noTextLayer: true },
      { state: "ready", noTextLayer: true, ocr: true },
    ]);
    expect(r.complete).toBe(false);
    expect(r.processed).toBe(4);
    expect(r.failedPages).toEqual([2]);
    expect(r.unanalyzedScannedPages).toEqual([3]);
  });

  it("is complete when all pages are ready", () => {
    expect(exportReadiness([{ state: "ready", noTextLayer: false }]).complete).toBe(true);
  });
});

describe("redactedFileName", () => {
  it("appends -redacted", () => {
    expect(redactedFileName("Báo cáo.PDF")).toBe("Báo cáo-redacted.pdf");
    expect(redactedFileName(null)).toBe("document-redacted.pdf");
  });
});
