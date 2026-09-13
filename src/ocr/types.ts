/** Image-space box (pixels, origin top-left). */
export interface ImageBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  bbox: ImageBox;
  /** 0..1 */
  confidence: number;
}

export interface OcrLine {
  text: string;
  bbox: ImageBox;
  /** Baseline segment in image pixels, when the engine provides it. */
  baseline?: ImageBox;
  /** 0..1 — recognition confidence, independent of language confidence (spec §23). */
  confidence: number;
  words: OcrWord[];
}

/** Anything the engine can read: a canvas in the browser, PNG bytes in Node. */
export type OcrImage = HTMLCanvasElement | OffscreenCanvas | Uint8Array;

/** Offline OCR engine (spec §22). Tesseract today; PaddleOCR could implement the same interface. */
export interface OcrEngine {
  readonly id: string;
  recognize(image: OcrImage): Promise<OcrLine[]>;
  dispose(): Promise<void>;
}

export class OcrUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrUnavailableError";
  }
}
