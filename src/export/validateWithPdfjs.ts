import { destroyPdf, loadPdf } from "../pdf/pdfLoader";
import { textItemsFromContent } from "../pdf/textExtractor";
import { findItemLeaks, type ExtractedItem } from "./validateRedaction";
import type { RedactionRegion, ValidationReport } from "./types";

/** Second, independent extraction engine (spec §21): PDF.js text content of the exported file. */
export async function validateWithPdfjs(bytes: Uint8Array, regions: readonly RedactionRegion[]): Promise<ValidationReport> {
  const pageIndices = [...new Set(regions.map((r) => r.pageIndex))];
  const { doc } = await loadPdf(bytes);
  try {
    const items: ExtractedItem[] = [];
    for (const pageIndex of pageIndices) {
      const page = await doc.getPage(pageIndex + 1);
      const content = await page.getTextContent();
      for (const item of textItemsFromContent(content, pageIndex)) {
        items.push({ pageIndex, text: item.text, bbox: { x: item.x, y: item.y, width: item.width, height: item.height } });
      }
    }
    const leaks = findItemLeaks(items, regions);
    return { ok: leaks.length === 0, checkedRegions: regions.length, engines: ["pdfjs-text"], leaks };
  } finally {
    await destroyPdf(doc);
  }
}

/** Plain text of every page (normalized, whitespace removed) — used by tests and diagnostics. */
export async function extractAllText(bytes: Uint8Array): Promise<string[]> {
  const { doc, pageCount } = await loadPdf(bytes);
  try {
    const pages: string[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      pages.push(textItemsFromContent(content, i - 1).map((it) => it.text).join(" "));
    }
    return pages;
  } finally {
    await destroyPdf(doc);
  }
}
