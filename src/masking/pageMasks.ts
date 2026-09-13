import type { DetectionResult } from "../detection/types";
import type { TextLine } from "../grouping/types";
import type { PageGeometry } from "../pdf/types";
import { applyOverride, effectiveTier, generateMasks, type MaskPadding } from "./maskGenerator";
import type { DetectionThresholds } from "./thresholds";
import type { MaskOverride, MaskRegion } from "./types";

export interface ResolvePageMasksInput {
  pageIndex: number;
  content: { lines: readonly TextLine[]; detections: readonly DetectionResult[] } | undefined;
  geometry: PageGeometry | undefined;
  overrides: Readonly<Record<string, MaskOverride>>;
  manual: readonly MaskRegion[];
  revealed: Readonly<Record<string, true>>;
  padding: MaskPadding;
  thresholds: DetectionThresholds;
}

/** Detector masks with user decisions applied, plus the page's manual masks. Pure. */
export function resolvePageMasks(input: ResolvePageMasksInput): MaskRegion[] {
  const { pageIndex, content, geometry, overrides, manual, revealed, padding, thresholds } = input;
  if (!content || !geometry || !content.detections.length) {
    return manual.filter((m) => m.pageIndex === pageIndex).map((m) => applyOverride(m, undefined, !!revealed[m.key]));
  }

  // Lines that will be solidly masked don't need protecting from neighbouring masks.
  const masked = new Set<string>();
  const candidates = generateMasks({ pageIndex, geometry, lines: content.lines, detections: content.detections, padding });
  for (const m of candidates) {
    const override = overrides[m.key];
    const auto = effectiveTier(applyOverride(m, override, false), thresholds) === "auto";
    if (auto && m.lineId) masked.add(m.lineId);
  }
  const detected = generateMasks({
    pageIndex,
    geometry,
    lines: content.lines,
    detections: content.detections,
    padding,
    isVisibleLine: (id) => !masked.has(id),
  });
  return [
    ...detected.map((m) => applyOverride(m, overrides[m.key], !!revealed[m.key])),
    ...manual.filter((m) => m.pageIndex === pageIndex).map((m) => applyOverride(m, undefined, !!revealed[m.key])),
  ];
}
