import * as mupdf from "mupdf";
import { transformBox } from "../pdf/coordinateTransform";
import type { BoundingBox, Matrix } from "../pdf/types";
import { ExportError, type RedactionRegion, type RedactionRequest, type RedactionResult } from "./types";

/**
 * Permanent redaction with MuPDF (AGPL-3.0; isolated in src/export).
 * Glyphs, image pixels and covered line art under each region are removed from the content,
 * the document is sanitized, and the file is fully rewritten (never an incremental save).
 */

/** Catalog entries that can carry hidden copies of text or other leaks. */
const CATALOG_KEYS = ["Metadata", "Outlines", "AcroForm", "Names", "OpenAction", "AA", "StructTreeRoot", "MarkInfo", "PieceInfo", "Threads", "Dests"];
/** Page entries that can carry text or pre-rendered copies of the page. */
const PAGE_KEYS = ["Annots", "Thumb", "PieceInfo", "Metadata", "AA", "B"];

export const SAVE_OPTIONS = "decrypt,garbage=deduplicate,compress,clean,sanitize";

export function openPdf(bytes: Uint8Array, password?: string): mupdf.PDFDocument {
  let doc: mupdf.Document;
  try {
    doc = mupdf.Document.openDocument(bytes, "application/pdf");
  } catch (err) {
    throw new ExportError("not-pdf", `The document could not be opened for redaction: ${message(err)}`);
  }
  if (!(doc instanceof mupdf.PDFDocument)) throw new ExportError("not-pdf", "Only PDF documents can be redacted.");
  if (doc.needsPassword() && !(password && doc.authenticatePassword(password))) {
    throw new ExportError("password", "The document password is required to export.");
  }
  return doc;
}

/** PDF user-space box → MuPDF page-space rect ([x0, y0, x1, y1], y down, rotation applied). */
export function toPageRect(box: BoundingBox, pageTransform: Matrix): mupdf.Rect {
  const b = transformBox(pageTransform, box);
  return [b.x, b.y, b.x + b.width, b.y + b.height];
}

export function groupByPage(regions: readonly RedactionRegion[]): Map<number, RedactionRegion[]> {
  const byPage = new Map<number, RedactionRegion[]>();
  for (const r of regions) {
    const list = byPage.get(r.pageIndex) ?? [];
    list.push(r);
    byPage.set(r.pageIndex, list);
  }
  return byPage;
}

export function redactPdf({ bytes, password, regions }: RedactionRequest): RedactionResult {
  const start = Date.now();
  const doc = openPdf(bytes, password);
  try {
    const pageCount = doc.countPages();
    const byPage = groupByPage(regions);

    for (const [pageIndex, pageRegions] of byPage) {
      if (pageIndex < 0 || pageIndex >= pageCount) {
        throw new ExportError("redaction-failed", `Region refers to page ${pageIndex + 1}, which does not exist.`);
      }
      const page = doc.loadPage(pageIndex) as mupdf.PDFPage;
      const transform = page.getTransform() as Matrix;
      for (const region of pageRegions) {
        const annot = page.createAnnotation("Redact");
        annot.setRect(toPageRect(region.bbox, transform));
      }
      page.applyRedactions(
        true,
        mupdf.PDFPage.REDACT_IMAGE_PIXELS,
        mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
        mupdf.PDFPage.REDACT_TEXT_REMOVE,
      );
    }

    const removed = sanitize(doc, pageCount);
    const output = doc.saveToBuffer(SAVE_OPTIONS).asUint8Array().slice();
    return {
      bytes: output,
      report: {
        redactedRegions: regions.length,
        redactedPages: byPage.size,
        removed,
        durationMs: Date.now() - start,
      },
    };
  } catch (err) {
    if (err instanceof ExportError) throw err;
    throw new ExportError("redaction-failed", `Redaction failed: ${message(err)}`);
  } finally {
    doc.destroy?.();
  }
}

/** Removes document parts that could still expose hidden text. Returns human-readable labels. */
function sanitize(doc: mupdf.PDFDocument, pageCount: number): string[] {
  const removed = new Set<string>();
  const trailer = doc.getTrailer();

  if (!trailer.get("Info").isNull()) {
    trailer.delete("Info");
    removed.add("Document information (title, author, subject, keywords)");
  }
  const root = trailer.get("Root");
  for (const key of CATALOG_KEYS) {
    if (!root.get(key).isNull()) {
      root.delete(key);
      removed.add(catalogLabel(key));
    }
  }
  for (let i = 0; i < pageCount; i++) {
    const pageObj = (doc.loadPage(i) as mupdf.PDFPage).getObject();
    for (const key of PAGE_KEYS) {
      if (!pageObj.get(key).isNull()) {
        pageObj.delete(key);
        removed.add(pageLabel(key));
      }
    }
  }
  return [...removed];
}

function catalogLabel(key: string): string {
  switch (key) {
    case "Metadata":
      return "XMP metadata";
    case "Outlines":
      return "Bookmarks";
    case "AcroForm":
      return "Form fields";
    case "Names":
    case "Dests":
      return "Attachments, named destinations and scripts";
    case "StructTreeRoot":
    case "MarkInfo":
      return "Tagged structure (alternate / actual text)";
    default:
      return "Document actions and private data";
  }
}

function pageLabel(key: string): string {
  switch (key) {
    case "Annots":
      return "Annotations, comments and links";
    case "Thumb":
      return "Page thumbnails";
    default:
      return "Page private data and actions";
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
