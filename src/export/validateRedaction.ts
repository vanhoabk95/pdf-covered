import * as mupdf from "mupdf";
import { intersectBoxes, padBox } from "../grouping/bbox";
import type { BoundingBox, Matrix } from "../pdf/types";
import { groupByPage, openPdf, toPageRect } from "./redactPdf";
import type { Leak, RedactionRegion, ValidationReport } from "./types";

/**
 * Verifies an exported PDF with MuPDF (spec §21): no extractable character may sit inside a
 * redacted region, and every region must render as an opaque box.
 * pdfjs-based checks live in validateWithPdfjs.ts (main thread).
 */

/** Characters whose center lies this far inside a region count as leaks (points). */
const CHAR_INSET = 0.5;
/** Minimum share of dark pixels inside a region's rendered interior. */
export const MIN_DARK_FRACTION = 0.97;
const RENDER_SCALE = 2;

export function validateWithMupdf(bytes: Uint8Array, regions: readonly RedactionRegion[]): ValidationReport {
  const leaks: Leak[] = [];
  const doc = openPdf(bytes);
  try {
    for (const [pageIndex, pageRegions] of groupByPage(regions)) {
      const page = doc.loadPage(pageIndex) as mupdf.PDFPage;
      const transform = page.getTransform() as Matrix;
      const rects = pageRegions.map((r) => ({ region: r, rect: toPageRect(padBox(r.bbox, -CHAR_INSET, -CHAR_INSET), transform) }));

      // 1. Text: any character centered inside a region is a leak.
      page.toStructuredText("preserve-whitespace,preserve-ligatures").walk({
        onChar(c, _origin, _font, _size, quad) {
          if (!c.trim()) return;
          const cx = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
          const cy = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
          const hit = rects.find(({ rect }) => cx >= rect[0] && cx <= rect[2] && cy >= rect[1] && cy <= rect[3]);
          if (hit) {
            leaks.push({ pageIndex, engine: "mupdf-text", bbox: hit.region.bbox, detail: `Extractable character "${c}"` });
          }
        },
      });

      // 2. Pixels: the region must be opaque black when rendered.
      const pixmap = page.toPixmap(mupdf.Matrix.scale(RENDER_SCALE, RENDER_SCALE), mupdf.ColorSpace.DeviceRGB, false);
      try {
        const [px0, py0] = pixmap.getBounds();
        const width = pixmap.getWidth();
        const height = pixmap.getHeight();
        const samples = pixmap.getPixels();
        const n = pixmap.getNumberOfComponents();
        for (const { region } of rects) {
          const r = toPageRect(padBox(region.bbox, -1, -1), transform);
          const x0 = Math.max(0, Math.ceil(r[0] * RENDER_SCALE - px0));
          const y0 = Math.max(0, Math.ceil(r[1] * RENDER_SCALE - py0));
          const x1 = Math.min(width, Math.floor(r[2] * RENDER_SCALE - px0));
          const y1 = Math.min(height, Math.floor(r[3] * RENDER_SCALE - py0));
          let total = 0;
          let dark = 0;
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const i = (y * width + x) * n;
              total++;
              if (samples[i] + samples[i + 1] + samples[i + 2] < 60) dark++;
            }
          }
          if (total > 0 && dark / total < MIN_DARK_FRACTION) {
            leaks.push({
              pageIndex,
              engine: "pixels",
              bbox: region.bbox,
              detail: `Region is only ${Math.round((dark / total) * 100)}% opaque`,
            });
          }
        }
      } finally {
        pixmap.destroy?.();
      }
    }
  } finally {
    doc.destroy?.();
  }
  return { ok: leaks.length === 0, checkedRegions: regions.length, engines: ["mupdf-text", "pixels"], leaks: dedupe(leaks) };
}

export interface ExtractedItem {
  pageIndex: number;
  text: string;
  bbox: BoundingBox;
}

/** Share of an extracted text item's area inside a region above which it counts as a leak. */
const ITEM_OVERLAP = 0.5;

/** Engine-independent check used with PDF.js text items (see validateWithPdfjs). */
export function findItemLeaks(items: readonly ExtractedItem[], regions: readonly RedactionRegion[]): Leak[] {
  const leaks: Leak[] = [];
  const byPage = groupByPage(regions);
  for (const item of items) {
    const area = item.bbox.width * item.bbox.height;
    if (!item.text.trim() || area <= 0) continue;
    for (const region of byPage.get(item.pageIndex) ?? []) {
      const inter = intersectBoxes(item.bbox, region.bbox);
      if (inter && (inter.width * inter.height) / area >= ITEM_OVERLAP) {
        leaks.push({ pageIndex: item.pageIndex, engine: "pdfjs-text", bbox: region.bbox, detail: `Extractable text "${item.text.slice(0, 40)}"` });
        break;
      }
    }
  }
  return dedupe(leaks);
}

export function mergeReports(...reports: ValidationReport[]): ValidationReport {
  const leaks = dedupe(reports.flatMap((r) => r.leaks));
  return {
    ok: leaks.length === 0,
    checkedRegions: Math.max(0, ...reports.map((r) => r.checkedRegions)),
    engines: [...new Set(reports.flatMap((r) => r.engines))],
    leaks,
  };
}

function dedupe(leaks: Leak[]): Leak[] {
  const seen = new Set<string>();
  return leaks.filter((l) => {
    const key = `${l.pageIndex}|${l.engine}|${l.bbox.x.toFixed(1)},${l.bbox.y.toFixed(1)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
