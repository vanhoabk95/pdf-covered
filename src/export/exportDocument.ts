import { elapsedMs, log } from "../app/log";
import type { ExportWorkerRequest, ExportWorkerResponse } from "../workers/export.worker";
import { ExportError, type RedactionReport, type RedactionRequest, type ValidationReport } from "./types";
import { mergeReports } from "./validateRedaction";
import { validateWithPdfjs } from "./validateWithPdfjs";

export type ExportStage = "redacting" | "verifying" | "saving";

export interface ExportOutcome {
  bytes: Uint8Array;
  report: RedactionReport;
  validation: ValidationReport;
}

/**
 * Redacts in the export worker (MuPDF), then verifies with both MuPDF (worker) and PDF.js
 * (here). Throws ExportError("validation-failed") if any redacted content is still extractable —
 * the caller must not write the file in that case.
 */
export async function exportRedactedPdf(
  request: RedactionRequest,
  onStage: (stage: ExportStage) => void = () => undefined,
): Promise<ExportOutcome> {
  const start = performance.now();
  onStage("redacting");
  const worker = new Worker(new URL("../workers/export.worker.ts", import.meta.url), { type: "module" });
  try {
    const response = await new Promise<Exclude<ExportWorkerResponse, { ready: true }>>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<ExportWorkerResponse>) => {
        const data = e.data;
        if ("ready" in data) {
          // Worker (and MuPDF WASM) initialized: now it's safe to send the job.
          const message: ExportWorkerRequest = { id: 1, request: { ...request, bytes: request.bytes.slice() } };
          worker.postMessage(message, [message.request.bytes.buffer]);
          return;
        }
        resolve(data);
      };
      worker.onerror = (e) => reject(new ExportError("redaction-failed", `Export worker failed: ${e.message || "unknown error"}`));
    });
    if (!response.ok) throw new ExportError(response.kind as ExportError["kind"], response.error);

    onStage("verifying");
    const pdfjsReport = await validateWithPdfjs(response.result.bytes, request.regions);
    const validation = mergeReports(response.validation, pdfjsReport);
    log.info("redaction finished", {
      regions: response.result.report.redactedRegions,
      pages: response.result.report.redactedPages,
      redactMs: response.result.report.durationMs,
      totalMs: elapsedMs(start),
      verified: validation.ok,
      leaks: validation.leaks.length,
    });
    if (!validation.ok) {
      const error = new ExportError(
        "validation-failed",
        `Verification found ${validation.leaks.length} region(s) whose content is still recoverable. The file was not saved.`,
      );
      (error as ExportError & { validation?: ValidationReport }).validation = validation;
      throw error;
    }
    return { bytes: response.result.bytes, report: response.result.report, validation };
  } finally {
    worker.terminate();
  }
}
