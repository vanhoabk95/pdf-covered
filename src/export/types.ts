import type { BoundingBox } from "../pdf/types";

/** One region to remove permanently. Geometry in PDF user space. */
export interface RedactionRegion {
  pageIndex: number;
  bbox: BoundingBox;
  /** Text that was under the region (empty for manual masks); used by validation only. */
  sourceText: string;
}

export interface RedactionRequest {
  bytes: Uint8Array;
  password?: string;
  regions: RedactionRegion[];
}

export interface RedactionReport {
  redactedRegions: number;
  redactedPages: number;
  /** Document parts removed during sanitization (metadata, annotations…). */
  removed: string[];
  durationMs: number;
}

export interface RedactionResult {
  bytes: Uint8Array;
  report: RedactionReport;
}

export type LeakEngine = "mupdf-text" | "pdfjs-text" | "pixels";

export interface Leak {
  pageIndex: number;
  engine: LeakEngine;
  bbox: BoundingBox;
  detail: string;
}

export interface ValidationReport {
  ok: boolean;
  checkedRegions: number;
  engines: LeakEngine[];
  leaks: Leak[];
}

export type ExportErrorKind = "password" | "not-pdf" | "redaction-failed" | "validation-failed" | "write-failed" | "incomplete";

export class ExportError extends Error {
  readonly kind: ExportErrorKind;
  constructor(kind: ExportErrorKind, message: string) {
    super(message);
    this.name = "ExportError";
    this.kind = kind;
  }
}
