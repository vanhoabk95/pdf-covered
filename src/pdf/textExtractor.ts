import type { PDFPageProxy } from "pdfjs-dist";
import type { TextContent, TextItem, TextStyle } from "pdfjs-dist/types/src/display/api";
import { boxFromEdges } from "../grouping/bbox";
import type { Matrix, PdfTextItem } from "./types";

const DEFAULT_ASCENT = 0.8;
const DEFAULT_DESCENT = 0.2;

/** Extracts positioned text items from a PDF page (PDF user space). */
export async function extractPageText(page: PDFPageProxy, pageIndex: number): Promise<PdfTextItem[]> {
  const content = await page.getTextContent({ includeMarkedContent: false });
  return textItemsFromContent(content, pageIndex);
}

/** Pure conversion from PDF.js text content. Skips marked-content markers and blank runs. */
export function textItemsFromContent(content: TextContent, pageIndex: number): PdfTextItem[] {
  const result: PdfTextItem[] = [];
  content.items.forEach((raw, itemIndex) => {
    if (!("str" in raw)) return;
    const text = cleanText(raw.str);
    if (!text.trim()) return;
    const item = toTextItem(raw, text, content.styles[raw.fontName], pageIndex, itemIndex);
    if (item) result.push(item);
  });
  return result;
}

function toTextItem(
  raw: TextItem,
  text: string,
  style: TextStyle | undefined,
  pageIndex: number,
  itemIndex: number,
): PdfTextItem | null {
  const tx = raw.transform as Matrix;
  const fontSize = Math.hypot(tx[2], tx[3]);
  if (!Number.isFinite(fontSize) || fontSize <= 0) return null;

  const ascentRatio = style?.ascent ? style.ascent : style?.descent ? 1 + style.descent : DEFAULT_ASCENT;
  const descentRatio = style?.descent ? -style.descent : DEFAULT_DESCENT;
  const ascent = fontSize * clamp(ascentRatio, 0.5, 1.2);
  const descent = fontSize * clamp(descentRatio, 0, 0.5);

  const [e, f] = [tx[4], tx[5]];
  const vertical = !!style?.vertical;
  let x0: number, y0: number, x1: number, y1: number, rotation: number, advance: number;

  if (vertical) {
    // Vertical writing: glyphs advance downward from the origin, centered on it.
    advance = Math.abs(raw.height);
    rotation = -90;
    [x0, y0, x1, y1] = [e - fontSize / 2, f - advance, e + fontSize / 2, f];
  } else {
    advance = Math.abs(raw.width);
    const angle = Math.atan2(tx[1], tx[0]);
    rotation = normalizeDegrees((angle * 180) / Math.PI);
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    const corners = [
      [0, -descent],
      [advance, -descent],
      [0, ascent],
      [advance, ascent],
    ].map(([u, v]) => [e + u * cos - v * sin, f + u * sin + v * cos]);
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  const box = boxFromEdges(x0, y0, x1, y1);
  return {
    id: `p${pageIndex}-i${itemIndex}`,
    pageIndex,
    itemIndex,
    text,
    ...box,
    fontSize,
    rotation,
    baselineX: e,
    baselineY: f,
    advance,
    ascent,
    descent,
    dir: vertical ? "ttb" : raw.dir === "rtl" ? "rtl" : "ltr",
    fontName: raw.fontName,
    hasEOL: raw.hasEOL,
    transform: tx,
  };
}

// C0/C1 control characters (except tab/newline/CR) that broken ToUnicode maps often emit.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Drops control characters and composes combining marks (u + U+0323 → ụ). */
export function cleanText(str: string): string {
  return str.replace(CONTROL_CHARS, "").normalize("NFC");
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function normalizeDegrees(deg: number): number {
  let d = deg % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return Math.abs(d) < 1e-9 ? 0 : d;
}
