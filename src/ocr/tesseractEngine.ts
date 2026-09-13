import { createWorker, OEM, PSM, type Worker } from "tesseract.js";
import { OcrUnavailableError, type OcrEngine, type OcrImage, type OcrLine } from "./types";

export interface TesseractPaths {
  /** Directory (URL or filesystem path) containing vie/eng .traineddata.gz. */
  langPath: string;
  /** Browser only: worker script and core directory served locally. */
  workerPath?: string;
  corePath?: string;
}

export const OCR_LANGUAGES = ["vie", "eng"];

/**
 * Tesseract.js (Apache-2.0) with Vietnamese + English LSTM models, fully offline:
 * every asset is served from the app bundle (see scripts/copy-ocr-assets.mjs).
 */
export function createTesseractEngine(paths: TesseractPaths): OcrEngine {
  let worker: Promise<Worker> | null = null;

  const getWorker = () => {
    worker ??= createWorker(OCR_LANGUAGES, OEM.LSTM_ONLY, {
      langPath: paths.langPath,
      ...(paths.workerPath ? { workerPath: paths.workerPath, workerBlobURL: false } : {}),
      ...(paths.corePath ? { corePath: paths.corePath } : {}),
      gzip: true,
      cacheMethod: "none",
    })
      .then(async (w) => {
        await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: "1" });
        return w;
      })
      .catch((err) => {
        worker = null;
        throw new OcrUnavailableError(`OCR engine could not start: ${err instanceof Error ? err.message : String(err)}`);
      });
    return worker;
  };

  return {
    id: "tesseract",
    async recognize(image: OcrImage): Promise<OcrLine[]> {
      const w = await getWorker();
      const input = image instanceof Uint8Array ? toNodeBuffer(image) : image;
      const { data } = await w.recognize(input as Parameters<Worker["recognize"]>[0], {}, { blocks: true, text: false });
      const lines: OcrLine[] = [];
      for (const block of data.blocks ?? []) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) {
            lines.push({
              text: line.text,
              bbox: line.bbox,
              baseline: line.baseline,
              confidence: line.confidence / 100,
              words: line.words.map((word) => ({ text: word.text, bbox: word.bbox, confidence: word.confidence / 100 })),
            });
          }
        }
      }
      return lines;
    },
    async dispose() {
      const w = worker;
      worker = null;
      if (w) await (await w).terminate().catch(() => undefined);
    },
  };
}

function toNodeBuffer(bytes: Uint8Array): unknown {
  const NodeBuffer = (globalThis as { Buffer?: { from(b: Uint8Array): unknown } }).Buffer;
  return NodeBuffer ? NodeBuffer.from(bytes) : new Blob([bytes as BlobPart], { type: "image/png" });
}
