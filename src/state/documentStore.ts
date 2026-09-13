import type { PDFDocumentProxy } from "pdfjs-dist";
import { create } from "zustand";
import { elapsedMs, log } from "../app/log";
import { destroyPdf, loadPdf, PdfLoadError, readPageGeometries, type PdfLoadErrorKind } from "../pdf/pdfLoader";
import type { PageGeometry } from "../pdf/types";
import type { OpenedFile } from "../platform/fileIO";

export type DocumentStatus = "idle" | "loading" | "password" | "ready" | "error";

export interface DocumentError {
  kind: PdfLoadErrorKind | "read-failed";
  message: string;
}

interface DocumentState {
  status: DocumentStatus;
  fileName: string | null;
  /** Original file bytes, kept for password retries and redacted export. */
  bytes: Uint8Array | null;
  pdf: PDFDocumentProxy | null;
  pageCount: number;
  geometries: PageGeometry[];
  error: DocumentError | null;
  passwordError: string | null;

  openFile(file: Promise<OpenedFile> | OpenedFile): Promise<void>;
  submitPassword(password: string): Promise<void>;
  cancelPassword(): void;
  closeDocument(): void;
  dismissError(): void;
}

// Password stays in module memory for the current document only; never persisted.
let sessionPassword: string | undefined;
// Monotonic token so a slow load can't overwrite a newer one.
let loadSeq = 0;

const emptyDocument = {
  fileName: null,
  bytes: null,
  pdf: null,
  pageCount: 0,
  geometries: [],
  error: null,
  passwordError: null,
};

export const useDocumentStore = create<DocumentState>((set, get) => {
  async function load(bytes: Uint8Array, password?: string): Promise<void> {
    const seq = ++loadSeq;
    const start = performance.now();
    try {
      const { doc, pageCount } = await loadPdf(bytes, password);
      const geometries = await readPageGeometries(doc);
      if (seq !== loadSeq) {
        void destroyPdf(doc);
        return;
      }
      sessionPassword = password;
      set({ status: "ready", pdf: doc, pageCount, geometries, passwordError: null, error: null });
      log.info("pdf loaded", { pages: pageCount, ms: elapsedMs(start) });
    } catch (err) {
      if (seq !== loadSeq) return;
      const e = err instanceof PdfLoadError ? err : new PdfLoadError("unknown", String(err));
      if (e.kind === "password-required" || e.kind === "password-incorrect") {
        set({
          status: "password",
          passwordError: e.kind === "password-incorrect" && password !== undefined ? e.message : null,
        });
      } else {
        log.error("pdf load failed", e);
        set({ ...emptyDocument, status: "error", error: { kind: e.kind, message: e.message } });
      }
    }
  }

  return {
    status: "idle",
    ...emptyDocument,

    async openFile(file) {
      const previous = get().pdf;
      sessionPassword = undefined;
      set({ ...emptyDocument, status: "loading" });
      if (previous) void destroyPdf(previous);

      let opened: OpenedFile;
      try {
        opened = await file;
      } catch (err) {
        set({
          status: "error",
          error: { kind: "read-failed", message: err instanceof Error ? err.message : String(err) },
        });
        return;
      }
      set({ fileName: opened.name, bytes: opened.bytes });
      await load(opened.bytes);
    },

    async submitPassword(password) {
      const { bytes } = get();
      if (!bytes) return;
      set({ status: "loading", passwordError: null });
      await load(bytes, password);
    },

    cancelPassword() {
      loadSeq++;
      sessionPassword = undefined;
      set({ ...emptyDocument, status: "idle" });
    },

    closeDocument() {
      loadSeq++;
      sessionPassword = undefined;
      const { pdf } = get();
      if (pdf) void destroyPdf(pdf);
      set({ ...emptyDocument, status: "idle" });
    },

    dismissError() {
      set({ ...emptyDocument, status: "idle" });
    },
  };
});

/** Password of the open document (memory only), needed later to re-open it for export. */
export function getSessionPassword(): string | undefined {
  return sessionPassword;
}
