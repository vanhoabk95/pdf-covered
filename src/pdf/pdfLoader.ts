import {
  getDocument,
  InvalidPDFException,
  PasswordException,
  PasswordResponses,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import { normalizeRotation } from "./coordinateTransform";
import type { PageGeometry } from "./types";

export type PdfLoadErrorKind =
  | "password-required"
  | "password-incorrect"
  | "corrupt"
  | "unsupported"
  | "unknown";

export class PdfLoadError extends Error {
  readonly kind: PdfLoadErrorKind;
  constructor(kind: PdfLoadErrorKind, message: string) {
    super(message);
    this.name = "PdfLoadError";
    this.kind = kind;
  }
}

export interface PdfAssetOptions {
  cMapUrl?: string;
  standardFontDataUrl?: string;
  wasmUrl?: string;
  iccUrl?: string;
}

let assetOptions: PdfAssetOptions = {};

/** Local asset locations for PDF.js (set once at app startup; never remote URLs). */
export function setPdfAssetOptions(options: PdfAssetOptions): void {
  assetOptions = options;
}

export interface LoadedPdf {
  doc: PDFDocumentProxy;
  pageCount: number;
}

/**
 * Opens a PDF from memory. `bytes` is copied because PDF.js transfers (detaches)
 * the buffer it receives, and the caller keeps the original for retries and export.
 */
export async function loadPdf(bytes: Uint8Array, password?: string): Promise<LoadedPdf> {
  const task = getDocument({
    data: bytes.slice(),
    password,
    ...assetOptions,
    cMapPacked: true,
    isEvalSupported: false,
    enableXfa: false,
  } as Parameters<typeof getDocument>[0]);

  try {
    const doc = await task.promise;
    return { doc, pageCount: doc.numPages };
  } catch (err) {
    await task.destroy().catch(() => undefined);
    throw toLoadError(err, password);
  }
}

export function toLoadError(err: unknown, password?: string): PdfLoadError {
  if (err instanceof PdfLoadError) return err;
  if (err instanceof PasswordException) {
    return err.code === PasswordResponses.INCORRECT_PASSWORD || password
      ? new PdfLoadError("password-incorrect", "The password is incorrect.")
      : new PdfLoadError("password-required", "This PDF is password-protected.");
  }
  if (err instanceof InvalidPDFException) {
    return new PdfLoadError("corrupt", "The file is not a valid PDF or is damaged.");
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/encrypt/i.test(message)) {
    return new PdfLoadError("unsupported", "This PDF uses an unsupported encryption method.");
  }
  return new PdfLoadError("unknown", `Could not open the PDF: ${message}`);
}

/** Releases the document and its worker resources. */
export async function destroyPdf(doc: PDFDocumentProxy): Promise<void> {
  await doc.loadingTask.destroy().catch(() => undefined);
}

/** Reads every page's static geometry. Cheap: parses page dictionaries only, no content. */
export async function readPageGeometries(doc: PDFDocumentProxy): Promise<PageGeometry[]> {
  const geometries: PageGeometry[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const [x0, y0, x1, y1] = page.view;
    geometries.push({
      viewBox: [x0, y0, x1, y1],
      rotate: normalizeRotation(page.rotate),
      userUnit: page.userUnit || 1,
    });
  }
  return geometries;
}
