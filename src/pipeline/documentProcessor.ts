import type { PDFPageProxy } from "pdfjs-dist";
import { elapsedMs, log } from "../app/log";
import type { DetectableLine, DetectionResult } from "../detection/types";
import { groupLines } from "../grouping/lineGrouper";
import type { TextLine } from "../grouping/types";
import { classifyConfidence } from "../masking/thresholds";
import { extractPageText } from "../pdf/textExtractor";
import type { PdfTextItem } from "../pdf/types";
import { nextPageToProcess, type PageProcessingState } from "./processingQueue";

export interface PageContentUpdate {
  state: PageProcessingState;
  items?: PdfTextItem[];
  lines?: TextLine[];
  detections?: DetectionResult[];
  /** No extractable text: candidate for OCR (spec §22). */
  noTextLayer?: boolean;
  ocr?: boolean;
  error?: string;
  timings?: { extractMs: number; groupMs: number; detectMs: number; ocrMs?: number };
}

export interface DocumentProcessorDeps {
  pageCount: number;
  getPage(pageIndex: number): Promise<PDFPageProxy>;
  getCurrentPage(): number;
  onPageUpdate(pageIndex: number, update: PageContentUpdate): void;
  /** Runs detectors on the page's lines (usually in a worker). Omit to skip detection. */
  detectLines?(lines: DetectableLine[]): Promise<DetectionResult[]>;
  /** Lets the UI breathe between pages. Defaults to a macrotask. */
  yieldToUi?: () => Promise<void>;
}

export interface ProcessingHandle {
  cancel(): void;
  done: Promise<void>;
}

const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Processes pages one at a time in priority order, re-evaluating the current page after
 * each one so jumping around the document reprioritizes remaining work.
 * Stages per page: extracting → detecting → ready (or error).
 */
export function startDocumentProcessing(deps: DocumentProcessorDeps): ProcessingHandle {
  const states: PageProcessingState[] = Array(deps.pageCount).fill("pending");
  const yieldToUi = deps.yieldToUi ?? macrotask;
  let cancelled = false;

  const run = async () => {
    const docStart = performance.now();
    while (!cancelled) {
      const pageIndex = nextPageToProcess(states, deps.getCurrentPage());
      if (pageIndex === null) break;

      states[pageIndex] = "extracting";
      deps.onPageUpdate(pageIndex, { state: "extracting" });
      try {
        const t0 = performance.now();
        const page = await deps.getPage(pageIndex);
        const items = await extractPageText(page, pageIndex);
        const extractMs = elapsedMs(t0);
        if (cancelled) return;

        const t1 = performance.now();
        const lines = groupLines(items);
        const groupMs = elapsedMs(t1);

        states[pageIndex] = "detecting";
        deps.onPageUpdate(pageIndex, { state: "detecting", items, lines, noTextLayer: items.length === 0 });

        const t2 = performance.now();
        const detections =
          deps.detectLines && lines.length ? await deps.detectLines(lines.map((l) => ({ id: l.id, text: l.text }))) : [];
        const detectMs = elapsedMs(t2);
        if (cancelled) return;

        states[pageIndex] = "ready";
        deps.onPageUpdate(pageIndex, {
          state: "ready",
          items,
          lines,
          detections,
          noTextLayer: items.length === 0,
          timings: { extractMs, groupMs, detectMs },
        });
        const tiers = detections.map((d) => classifyConfidence(d.confidence));
        log.info("page processed", {
          page: pageIndex + 1,
          items: items.length,
          lines: lines.length,
          detected: tiers.filter((t) => t === "auto").length,
          uncertain: tiers.filter((t) => t === "uncertain").length,
          extractMs,
          groupMs,
          detectMs,
        });
      } catch (err) {
        if (cancelled) return;
        states[pageIndex] = "error";
        deps.onPageUpdate(pageIndex, {
          state: "error",
          error: err instanceof Error ? err.message : String(err),
        });
        log.error(`page ${pageIndex + 1} processing failed`, err);
      }
      await yieldToUi();
    }
    if (!cancelled) log.info("document processed", { pages: deps.pageCount, ms: elapsedMs(docStart) });
  };

  return {
    cancel: () => {
      cancelled = true;
    },
    done: run(),
  };
}
