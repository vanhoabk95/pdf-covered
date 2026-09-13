import { cleanText, normalizeDegrees } from "../pdf/textExtractor";
import { applyMatrix, invertMatrix, transformBox } from "../pdf/coordinateTransform";
import { unionBoxes } from "../grouping/bbox";
import type { TextLine } from "../grouping/types";
import type { Matrix, PdfTextItem } from "../pdf/types";
import type { ImageBox, OcrLine } from "./types";

/** Lines whose recognition confidence is below this are dropped as noise. */
export const MIN_LINE_CONFIDENCE = 0.3;

const toBox = (b: ImageBox) => ({ x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 });

/**
 * Converts OCR lines from image pixels into TextLines in PDF user space.
 * `pdfToImage` maps PDF user space → image pixels (the render viewport transform).
 */
export function ocrLinesToTextLines(pageIndex: number, lines: readonly OcrLine[], pdfToImage: Matrix): TextLine[] {
  const imageToPdf = invertMatrix(pdfToImage);
  // Direction of the image x-axis in PDF space → text rotation for upright scanned text.
  const [ox, oy] = applyMatrix(imageToPdf, 0, 0);
  const [dx, dy] = applyMatrix(imageToPdf, 1, 0);
  const rotation = normalizeDegrees((Math.atan2(dy - oy, dx - ox) * 180) / Math.PI);
  const [ux, uy] = applyMatrix(imageToPdf, 0, 1);
  const pdfUnitsPerPixel = Math.hypot(ux - ox, uy - oy);

  const result: TextLine[] = [];
  lines.forEach((line, lineIndex) => {
    const text = cleanText(line.text).replace(/\s+/g, " ").trim();
    if (!text || !/\p{L}|\p{N}/u.test(text) || line.confidence < MIN_LINE_CONFIDENCE) return;

    const lineHeightPx = line.bbox.y1 - line.bbox.y0;
    const baselinePx = line.baseline ? (line.baseline.y0 + line.baseline.y1) / 2 : line.bbox.y1 - lineHeightPx * 0.2;
    const ascentPx = Math.max(1, baselinePx - line.bbox.y0);
    const descentPx = Math.max(0, line.bbox.y1 - baselinePx);
    const fontSize = (ascentPx / 0.75) * pdfUnitsPerPixel;

    const words = line.words.length ? line.words : [{ text, bbox: line.bbox, confidence: line.confidence }];
    const items: PdfTextItem[] = words
      .filter((w) => cleanText(w.text).trim())
      .map((word, wordIndex) => {
        const box = transformBox(imageToPdf, toBox(word.bbox));
        const [bx, by] = applyMatrix(imageToPdf, word.bbox.x0, baselinePx);
        return {
          id: `p${pageIndex}-ocr${lineIndex}-w${wordIndex}`,
          pageIndex,
          itemIndex: lineIndex * 1000 + wordIndex,
          text: cleanText(word.text).trim(),
          ...box,
          fontSize,
          rotation,
          baselineX: bx,
          baselineY: by,
          advance: (word.bbox.x1 - word.bbox.x0) * pdfUnitsPerPixel,
          ascent: ascentPx * pdfUnitsPerPixel,
          descent: descentPx * pdfUnitsPerPixel,
          dir: "ltr" as const,
          fontName: "ocr",
          hasEOL: wordIndex === words.length - 1,
          transform: [fontSize, 0, 0, fontSize, bx, by] as Matrix,
          source: "ocr" as const,
          ocrConfidence: word.confidence,
        };
      });
    if (!items.length) return;

    result.push({
      id: `p${pageIndex}-ocr-l${lineIndex}`,
      pageIndex,
      text,
      items,
      itemIds: items.map((i) => i.id),
      bbox: unionBoxes([transformBox(imageToPdf, toBox(line.bbox)), ...items]),
      rotation,
      fontSize,
      ocrConfidence: line.confidence,
    });
  });
  return result;
}
