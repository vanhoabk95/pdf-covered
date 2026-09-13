import type { PDFPageProxy } from "pdfjs-dist";
import type { TextLine } from "../grouping/types";
import { CSS_PX_PER_PT, createViewportTransform } from "../pdf/coordinateTransform";
import type { PageGeometry } from "../pdf/types";
import { ocrLinesToTextLines } from "./ocrToLines";
import { createTesseractEngine } from "./tesseractEngine";
import type { OcrEngine } from "./types";

/** Target OCR resolution and a cap so huge pages don't exhaust memory. */
export const OCR_DPI = 300;
export const MAX_OCR_PIXELS = 24_000_000;

let engine: OcrEngine | null = null;

/** Session-wide Tesseract engine with locally served assets (browser / Tauri webview). */
export function getAppOcrEngine(): OcrEngine {
  if (!engine) {
    const base = new URL(`${import.meta.env.BASE_URL}tesseract/`, window.location.href).toString();
    engine = createTesseractEngine({
      langPath: `${base}lang`,
      workerPath: `${base}worker.min.js`,
      corePath: `${base}core`,
    });
  }
  return engine;
}

/** PDF points → pixels scale for OCR rendering (≈300 DPI, capped). */
export function ocrRenderScale(geometry: PageGeometry): number {
  const [x0, y0, x1, y1] = geometry.viewBox;
  const unit = geometry.userUnit || 1;
  const areaPt = Math.abs((x1 - x0) * (y1 - y0)) * unit * unit;
  const scale = OCR_DPI / 72;
  return Math.min(scale, Math.sqrt(MAX_OCR_PIXELS / Math.max(areaPt, 1)));
}

/** Renders a page with PDF.js and runs OCR; returns lines in PDF user space. */
export async function recognizePdfjsPage(
  ocr: OcrEngine,
  page: PDFPageProxy,
  pageIndex: number,
  geometry: PageGeometry,
): Promise<TextLine[]> {
  const scale = ocrRenderScale(geometry);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  try {
    await page.render({ canvas, viewport }).promise;
    const lines = await ocr.recognize(canvas);
    const pdfToImage = createViewportTransform(geometry, scale / CSS_PX_PER_PT).transform;
    return ocrLinesToTextLines(pageIndex, lines, pdfToImage);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
