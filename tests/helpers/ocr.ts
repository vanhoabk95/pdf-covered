import * as mupdf from "mupdf";
import type { PDFPageProxy } from "pdfjs-dist";
import { join } from "node:path";
import type { TextLine } from "../../src/grouping/types";
import { ocrLinesToTextLines } from "../../src/ocr/ocrToLines";
import { createTesseractEngine } from "../../src/ocr/tesseractEngine";
import type { OcrEngine } from "../../src/ocr/types";
import type { Matrix } from "../../src/pdf/types";

/** Tesseract with the language data copied by `pnpm pretest` (scripts/copy-ocr-assets.mjs). */
export function createNodeOcrEngine(): OcrEngine {
  return createTesseractEngine({ langPath: join(import.meta.dirname, "..", "..", "public", "tesseract", "lang") });
}

export const NODE_OCR_DPI = 300;

/** Renders a page with MuPDF and OCRs it (Node has no canvas for PDF.js rendering). */
export async function recognizeWithMupdf(engine: OcrEngine, bytes: Uint8Array, pageIndex: number): Promise<TextLine[]> {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const page = doc.loadPage(pageIndex) as mupdf.PDFPage;
  const scale = NODE_OCR_DPI / 72;
  const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false);
  const png = pixmap.asPNG();
  const pdfToImage = mupdf.Matrix.concat(page.getTransform(), mupdf.Matrix.scale(scale, scale)) as Matrix;
  const lines = await engine.recognize(png);
  return ocrLinesToTextLines(pageIndex, lines, pdfToImage);
}

/** Adapter for startDocumentProcessing's `ocr` dependency. */
export function nodeOcrDependency(engine: OcrEngine, bytes: Uint8Array) {
  return {
    enabled: () => true,
    recognize: (pageIndex: number, _page: PDFPageProxy) => recognizeWithMupdf(engine, bytes, pageIndex),
  };
}
