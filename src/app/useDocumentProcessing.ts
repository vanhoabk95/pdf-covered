import { useEffect } from "react";
import type { TextLine } from "../grouping/types";
import { getAppOcrEngine, recognizePdfjsPage } from "../ocr/pageOcr";
import { startDocumentProcessing } from "../pipeline/documentProcessor";
import { useDocumentStore } from "../state/documentStore";
import { usePageContentStore } from "../state/pageContentStore";
import { getCachedAnalysis, storeAnalysis } from "../state/sessionCache";
import { useSettingsStore } from "../state/settingsStore";
import { useViewerStore } from "../state/viewerStore";
import { createDetectionClient } from "../workers/detectionClient";

/** OCR results for the open document, so toggling OCR or restarting doesn't re-run Tesseract. */
const ocrCache = new Map<number, TextLine[]>();

/** Starts page processing whenever a document opens; cancels it when the document changes. */
export function useDocumentProcessing(): void {
  const pdf = useDocumentStore((s) => s.pdf);
  const documentHash = useDocumentStore((s) => s.documentHash);
  const pageCount = useDocumentStore((s) => s.pageCount);
  const started = usePageContentStore((s) => s.started);
  const ocrEnabled = useSettingsStore((s) => s.ocrEnabled);

  // New document: reset page state and caches; start automatically unless turned off.
  useEffect(() => {
    ocrCache.clear();
    const content = usePageContentStore.getState();
    if (!pdf) content.reset();
    else content.init(pageCount, useSettingsStore.getState().autoDetect);
  }, [pdf, pageCount]);

  // (Re)start processing; re-runs when OCR is toggled so scanned pages pick up the change.
  useEffect(() => {
    // Read the store directly: `started` from this render may still belong to the previous document.
    if (!pdf || !started || !usePageContentStore.getState().started) return;

    // Same file analyzed earlier this session with the same OCR setting: reuse the results.
    const cached = documentHash ? getCachedAnalysis(documentHash, ocrEnabled) : undefined;
    if (cached && cached.length === pageCount) {
      const content = usePageContentStore.getState();
      cached.forEach((page, i) => content.applyUpdate(i, page));
      return;
    }

    const detection = createDetectionClient();
    const handle = startDocumentProcessing({
      pageCount,
      getPage: (i) => pdf.getPage(i + 1),
      getCurrentPage: () => useViewerStore.getState().currentPage,
      onPageUpdate: (i, update) => usePageContentStore.getState().applyUpdate(i, update),
      detectLines: (lines) => detection.detect(lines),
      ocr: {
        enabled: () => ocrEnabled,
        recognize: async (pageIndex, page) => {
          const cached = ocrCache.get(pageIndex);
          if (cached) return cached;
          const geometry = useDocumentStore.getState().geometries[pageIndex];
          const lines = await recognizePdfjsPage(getAppOcrEngine(), page, pageIndex, geometry);
          ocrCache.set(pageIndex, lines);
          return lines;
        },
      },
    });
    let cancelled = false;
    void handle.done.then(() => {
      const pages = usePageContentStore.getState().pages;
      if (!cancelled && documentHash && pages.every((p) => p.state === "ready")) {
        storeAnalysis(documentHash, ocrEnabled, pages);
      }
    });
    return () => {
      cancelled = true;
      handle.cancel();
      detection.dispose();
    };
  }, [pdf, documentHash, pageCount, started, ocrEnabled]);
}
