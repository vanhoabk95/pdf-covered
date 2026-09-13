import type { PdfTextItem } from "../pdf/types";
import { unionBoxes } from "./bbox";
import type { TextLine } from "./types";

export interface LineGroupingOptions {
  /** Items whose directions differ by more than this (degrees) never share a line. */
  angleTolerance: number;
  /** Minimum vertical overlap (fraction of the smaller item height) to share a baseline row. */
  minVerticalOverlap: number;
  /** Maximum font size ratio within a line (tiny super/subscripts are exempt). */
  maxFontSizeRatio: number;
  /** Horizontal gap (in em of the larger font) that splits a row into separate lines. */
  maxGapEm: number;
  /** Horizontal gap (in em) above which a space is inserted between items. */
  spaceGapEm: number;
}

export const DEFAULT_LINE_GROUPING: LineGroupingOptions = {
  angleTolerance: 2,
  minVerticalOverlap: 0.5,
  maxFontSizeRatio: 1.5,
  maxGapEm: 1.5,
  spaceGapEm: 0.18,
};

/** Max characters for a run to count as a super/subscript (exempt from the font ratio rule). */
const SCRIPT_MAX_CHARS = 3;
/** How many recent rows to check when placing an item (items arrive top to bottom). */
const ROW_LOOKBACK = 8;

/** An item projected into its text direction's local frame: u along the text, v across it. */
interface Projected {
  item: PdfTextItem;
  uStart: number;
  uEnd: number;
  vLow: number;
  vHigh: number;
  vBase: number;
}

interface Row {
  anchor: Projected;
  members: Projected[];
}

/**
 * Groups extracted text items into logical lines:
 * same direction → overlapping baseline band → split at large horizontal gaps.
 * Pure and deterministic.
 */
export function groupLines(
  items: readonly PdfTextItem[],
  options: Partial<LineGroupingOptions> = {},
): TextLine[] {
  const opts = { ...DEFAULT_LINE_GROUPING, ...options };
  if (!items.length) return [];
  const pageIndex = items[0].pageIndex;

  const segments: { angle: number; members: Projected[] }[] = [];
  for (const bucket of bucketByDirection(items, opts.angleTolerance)) {
    const projected = bucket.items.map((it) => project(it, bucket.angle));
    for (const row of buildRows(projected, opts)) {
      for (const members of splitRow(row, opts)) {
        segments.push({ angle: bucket.angle, members });
      }
    }
  }

  const lines = segments.map(({ angle, members }) => buildLine(members, angle, pageIndex, opts));
  lines.sort(readingOrder);
  return lines.map((line, i) => ({ ...line, id: `p${pageIndex}-l${i}` }));
}

function bucketByDirection(items: readonly PdfTextItem[], tolerance: number) {
  const sorted = [...items].sort((a, b) => a.rotation - b.rotation || a.itemIndex - b.itemIndex);
  const buckets: { angle: number; items: PdfTextItem[] }[] = [];
  for (const item of sorted) {
    const last = buckets[buckets.length - 1];
    if (last && Math.abs(item.rotation - last.angle) <= tolerance) last.items.push(item);
    else buckets.push({ angle: item.rotation, items: [item] });
  }
  return buckets;
}

function project(item: PdfTextItem, angleDeg: number): Projected {
  const t = (angleDeg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(t), Math.sin(t)];
  const u = item.baselineX * cos + item.baselineY * sin;
  const v = -item.baselineX * sin + item.baselineY * cos;
  if (item.dir === "ttb") {
    // Vertical runs: v is the column center line, u grows downward from the origin.
    const half = item.fontSize / 2;
    return { item, uStart: u, uEnd: u + item.advance, vLow: v - half, vHigh: v + half, vBase: v };
  }
  return { item, uStart: u, uEnd: u + item.advance, vLow: v - item.descent, vHigh: v + item.ascent, vBase: v };
}

function buildRows(projected: Projected[], opts: LineGroupingOptions): Row[] {
  // Top of page first (highest baseline), then along the text.
  const sorted = [...projected].sort((a, b) => b.vBase - a.vBase || a.uStart - b.uStart);
  const rows: Row[] = [];
  for (const p of sorted) {
    let target: Row | undefined;
    for (let i = rows.length - 1; i >= Math.max(0, rows.length - ROW_LOOKBACK); i--) {
      if (fitsRow(rows[i], p, opts)) {
        target = rows[i];
        break;
      }
    }
    if (target) target.members.push(p);
    else rows.push({ anchor: p, members: [p] });
  }
  return rows;
}

function fitsRow(row: Row, p: Projected, opts: LineGroupingOptions): boolean {
  const a = row.anchor;
  const overlap = Math.min(a.vHigh, p.vHigh) - Math.max(a.vLow, p.vLow);
  const minHeight = Math.min(a.vHigh - a.vLow, p.vHigh - p.vLow);
  if (minHeight <= 0 || overlap / minHeight < opts.minVerticalOverlap) return false;
  return compatibleSizes(a.item, p.item, opts);
}

function compatibleSizes(a: PdfTextItem, b: PdfTextItem, opts: LineGroupingOptions): boolean {
  const ratio = Math.max(a.fontSize, b.fontSize) / Math.min(a.fontSize, b.fontSize);
  if (ratio <= opts.maxFontSizeRatio) return true;
  const smaller = a.fontSize < b.fontSize ? a : b;
  return smaller.text.trim().length <= SCRIPT_MAX_CHARS;
}

/** Splits a row at large gaps (columns, table cells) and drops duplicated overprint runs. */
function splitRow(row: Row, opts: LineGroupingOptions): Projected[][] {
  const sorted = [...row.members].sort((a, b) => a.uStart - b.uStart || a.item.itemIndex - b.item.itemIndex);
  const segments: Projected[][] = [];
  let current: Projected[] = [];
  let currentEnd = -Infinity;

  for (const p of sorted) {
    const prev = current[current.length - 1];
    if (prev && isDuplicateRun(prev, p)) continue;
    const em = prev ? Math.max(prev.item.fontSize, p.item.fontSize) : p.item.fontSize;
    if (prev && p.uStart - currentEnd > opts.maxGapEm * em) {
      segments.push(current);
      current = [];
      currentEnd = -Infinity;
    }
    current.push(p);
    currentEnd = Math.max(currentEnd, p.uEnd);
  }
  if (current.length) segments.push(current);
  return segments;
}

/** Fake-bold / overprinted text: the same string drawn again at (almost) the same place. */
function isDuplicateRun(prev: Projected, p: Projected): boolean {
  if (prev.item.text !== p.item.text) return false;
  const len = Math.max(prev.uEnd - prev.uStart, 1e-6);
  const overlap = Math.min(prev.uEnd, p.uEnd) - Math.max(prev.uStart, p.uStart);
  return overlap / len > 0.7;
}

function buildLine(
  members: Projected[],
  angle: number,
  pageIndex: number,
  opts: LineGroupingOptions,
): TextLine {
  let text = "";
  let prevEnd = -Infinity;
  for (const p of members) {
    const t = p.item.text;
    if (text) {
      const gap = p.uStart - prevEnd;
      const needsSpace = gap > opts.spaceGapEm * p.item.fontSize && !/\s$/.test(text) && !/^\s/.test(t);
      if (needsSpace) text += " ";
    }
    text += t;
    prevEnd = Math.max(prevEnd, p.uEnd);
  }

  const items = members.map((p) => p.item);
  const sizes = items.map((i) => i.fontSize).sort((a, b) => a - b);
  return {
    id: "",
    pageIndex,
    text: text.replace(/\s+/g, " ").trim(),
    items,
    itemIds: items.map((i) => i.id),
    bbox: unionBoxes(items),
    rotation: angle,
    fontSize: sizes[Math.floor(sizes.length / 2)],
  };
}

/** Top-to-bottom, then left-to-right, in unrotated page space. */
function readingOrder(a: TextLine, b: TextLine): number {
  const aTop = a.bbox.y + a.bbox.height;
  const bTop = b.bbox.y + b.bbox.height;
  const tolerance = Math.min(a.fontSize, b.fontSize) * 0.5;
  if (Math.abs(aTop - bTop) > tolerance) return bTop - aTop;
  return a.bbox.x - b.bbox.x;
}
