import type { DetectionResult } from "../detection/types";
import { intersectBoxes, padBox } from "../grouping/bbox";
import type { TextLine } from "../grouping/types";
import type { BoundingBox, PageGeometry } from "../pdf/types";
import { classifyConfidence, OCR_MIN_CONFIDENCE, type ConfidenceTier, type DetectionThresholds } from "./thresholds";
import type { MaskOverride, MaskRegion, MaskStatus } from "./types";

export interface MaskPadding {
  /** Points (PDF units), so padding scales with zoom. */
  x: number;
  y: number;
}

export const DEFAULT_MASK_PADDING: MaskPadding = { x: 2, y: 1 };

/** Approximate glyph extents relative to the baseline, in em (cap height / descender). */
const CAP_HEIGHT_EM = 0.75;
const DESCENDER_EM = 0.22;
/** Lines whose baselines differ by less than this (em) are considered the same row. */
const SAME_ROW_EM = 0.3;

export interface GenerateMasksInput {
  pageIndex: number;
  geometry: PageGeometry;
  lines: readonly TextLine[];
  detections: readonly DetectionResult[];
  padding?: MaskPadding;
  /**
   * Lines that stay readable (not masked). Masks are clipped only against these; two masked
   * neighbours may overlap freely. Defaults to every other line.
   */
  isVisibleLine?: (lineId: string) => boolean;
}

/**
 * Builds one candidate mask per detected line (pure). Status/visibility come from user
 * overrides later; tiers are applied at render time so thresholds can change instantly.
 *
 * Masks are padded, clamped to the page, and clipped so they don't cover the letters of
 * neighbouring *visible* lines (tight leading, close columns). A visible neighbour's x-height /
 * cap band is protected; its descenders may be covered so our own diacritics stay hidden.
 */
export function generateMasks({
  pageIndex,
  geometry,
  lines,
  detections,
  padding = DEFAULT_MASK_PADDING,
  isVisibleLine = () => true,
}: GenerateMasksInput): MaskRegion[] {
  const [x0, y0, x1, y1] = geometry.viewBox;
  const page: BoundingBox = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  const byId = new Map(lines.map((l) => [l.id, l]));
  const visibleLines = lines.filter((l) => isVisibleLine(l.id));

  const masks: MaskRegion[] = [];
  for (const detection of detections) {
    const line = byId.get(detection.lineId);
    if (!line) continue;
    const padded = padBox(line.bbox, padding.x, padding.y);
    const clipped = clipAgainstNeighbors(padded, line, visibleLines);
    const bbox = intersectBoxes(clipped, page);
    if (!bbox) continue;
    const key = regionKey(pageIndex, line.bbox, line.text);
    masks.push({
      id: `m-${key}`,
      key,
      pageIndex,
      bbox,
      sourceText: line.text,
      detector: detection.detector,
      language: detection.language,
      confidence: detection.confidence,
      status: "auto",
      visible: true,
      ocrConfidence: line.ocrConfidence,
      lineId: line.id,
      itemIds: line.itemIds,
    });
  }
  return masks;
}

/** Display decision for one mask given user overrides and thresholds. */
export type MaskDisplay = "solid" | "uncertain" | "revealed" | "hidden";

export function applyOverride(mask: MaskRegion, override: MaskOverride | undefined, revealed: boolean): MaskRegion {
  const status: MaskStatus = mask.status === "manual" ? "manual" : (override ?? mask.status);
  return { ...mask, status, visible: !revealed };
}

export function effectiveTier(mask: MaskRegion, thresholds: DetectionThresholds): ConfidenceTier {
  if (mask.status === "confirmed" || mask.status === "manual") return "auto";
  if (mask.status === "ignored") return "none";
  const tier = classifyConfidence(mask.confidence, thresholds);
  // Poorly recognized OCR text is never masked or redacted automatically.
  if (tier === "auto" && mask.ocrConfidence !== undefined && mask.ocrConfidence < OCR_MIN_CONFIDENCE) return "uncertain";
  return tier;
}

export function maskDisplay(mask: MaskRegion, thresholds: DetectionThresholds, showUncertain: boolean): MaskDisplay {
  const tier = effectiveTier(mask, thresholds);
  if (tier === "none") return "hidden";
  if (tier === "uncertain") return showUncertain ? "uncertain" : "hidden";
  return mask.visible ? "solid" : "revealed";
}

/** Should this region be permanently redacted on export? Uncertain regions never are (spec §42). */
export function isRedactable(mask: MaskRegion, thresholds: DetectionThresholds): boolean {
  return effectiveTier(mask, thresholds) === "auto";
}

function clipAgainstNeighbors(mask: BoundingBox, own: TextLine, lines: readonly TextLine[]): BoundingBox {
  let left = mask.x;
  let right = mask.x + mask.width;
  let bottom = mask.y;
  let top = mask.y + mask.height;
  const ownBaseline = baseline(own);

  for (const other of lines) {
    if (other.id === own.id) continue;
    const current = { x: left, y: bottom, width: right - left, height: top - bottom };
    if (!intersectBoxes(current, other.bbox)) continue;

    const ob = other.bbox;
    const bothHorizontal = isHorizontal(own) && isHorizontal(other);
    const otherBaseline = baseline(other);
    const em = Math.max(own.fontSize, other.fontSize);

    if (bothHorizontal && Math.abs(ownBaseline - otherBaseline) > SAME_ROW_EM * em) {
      // Different rows: protect the neighbour's letters between its baseline and cap height.
      if (otherBaseline < ownBaseline) {
        // Neighbour below: stay above its cap height; split if it reaches into our descenders.
        const capTop = otherBaseline + CAP_HEIGHT_EM * other.fontSize;
        const ownDescender = ownBaseline - DESCENDER_EM * own.fontSize;
        const limit = capTop <= ownDescender ? capTop : (capTop + ownDescender) / 2;
        // Always keep everything above our own baseline covered.
        bottom = Math.max(bottom, Math.min(limit, ownBaseline));
      } else {
        // Neighbour above: stay below its baseline (its descenders may be covered).
        const ownCapTop = ownBaseline + CAP_HEIGHT_EM * own.fontSize;
        const limit = otherBaseline >= ownCapTop ? otherBaseline : (otherBaseline + ownCapTop) / 2;
        top = Math.min(top, Math.max(limit, ownBaseline + 0.5 * own.fontSize));
      }
    } else {
      // Same row (or rotated text): split the horizontal gap between the two lines.
      const ownBox = own.bbox;
      if (ob.x >= ownBox.x + ownBox.width / 2) {
        right = Math.min(right, Math.max(ownBox.x + ownBox.width, (ownBox.x + ownBox.width + ob.x) / 2));
      } else if (ob.x + ob.width <= ownBox.x + ownBox.width / 2) {
        left = Math.max(left, Math.min(ownBox.x, (ob.x + ob.width + ownBox.x) / 2));
      }
    }
  }
  return { x: left, y: bottom, width: Math.max(0, right - left), height: Math.max(0, top - bottom) };
}

function isHorizontal(line: TextLine): boolean {
  return Math.abs(line.rotation) < 1;
}

function baseline(line: TextLine): number {
  const ys = line.items.map((i) => i.baselineY).sort((a, b) => a - b);
  return ys.length ? ys[Math.floor(ys.length / 2)] : line.bbox.y;
}

/** Stable key: page + geometry rounded to whole points + FNV-1a hash of the text. */
export function regionKey(pageIndex: number, bbox: BoundingBox, text: string): string {
  const r = (n: number) => Math.round(n);
  return `${pageIndex}:${r(bbox.x)},${r(bbox.y)},${r(bbox.width)},${r(bbox.height)}:${fnv1a(text).toString(36)}`;
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
