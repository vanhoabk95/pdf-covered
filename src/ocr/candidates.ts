import { OPS, type PDFPageProxy } from "pdfjs-dist";
import type { PdfTextItem } from "../pdf/types";

/** Pages with fewer extractable characters than this are considered image-only (spec §22). */
export const MIN_TEXT_CHARS = 20;

const IMAGE_OPS = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat].filter((op) => op !== undefined));

export function hasLittleText(items: readonly PdfTextItem[]): boolean {
  let chars = 0;
  for (const item of items) {
    chars += item.text.replace(/\s/g, "").length;
    if (chars >= MIN_TEXT_CHARS) return false;
  }
  return true;
}

/** True when the page draws at least one raster image (a scan or photo that may contain text). */
export async function pageHasImages(page: PDFPageProxy): Promise<boolean> {
  const ops = await page.getOperatorList();
  return ops.fnArray.some((fn) => IMAGE_OPS.has(fn));
}
