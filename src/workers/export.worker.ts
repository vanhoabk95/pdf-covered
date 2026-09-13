/// <reference lib="webworker" />
import { redactPdf } from "../export/redactPdf";
import { ExportError, type RedactionRequest, type RedactionResult, type ValidationReport } from "../export/types";
import { validateWithMupdf } from "../export/validateRedaction";

export interface ExportWorkerRequest {
  id: number;
  request: RedactionRequest;
}

export type ExportWorkerResponse =
  | { ready: true }
  | { id: number; ok: true; result: RedactionResult; validation: ValidationReport }
  | { id: number; ok: false; kind: string; error: string };

// MuPDF (WASM) runs here so redaction and verification never block the UI.
// mupdf.js loads its WASM with top-level await, so this module finishes evaluating late:
// messages posted before that can be lost. The client waits for this "ready" handshake.
self.onmessage = (event: MessageEvent<ExportWorkerRequest>) => {
  const { id, request } = event.data;
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  try {
    const result = redactPdf(request);
    const validation = validateWithMupdf(result.bytes, request.regions);
    const response: ExportWorkerResponse = { id, ok: true, result, validation };
    scope.postMessage(response, [result.bytes.buffer]);
  } catch (err) {
    const response: ExportWorkerResponse = {
      id,
      ok: false,
      kind: err instanceof ExportError ? err.kind : "redaction-failed",
      error: err instanceof Error ? err.message : String(err),
    };
    scope.postMessage(response);
  }
};

(self as unknown as DedicatedWorkerGlobalScope).postMessage({ ready: true } satisfies ExportWorkerResponse);
