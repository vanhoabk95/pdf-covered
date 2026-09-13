import { useEffect } from "react";
import { startDocumentProcessing } from "../pipeline/documentProcessor";
import { useDocumentStore } from "../state/documentStore";
import { usePageContentStore } from "../state/pageContentStore";
import { useSettingsStore } from "../state/settingsStore";
import { useViewerStore } from "../state/viewerStore";
import { createDetectionClient } from "../workers/detectionClient";

/** Starts page processing whenever a document opens; cancels it when the document changes. */
export function useDocumentProcessing(): void {
  const pdf = useDocumentStore((s) => s.pdf);
  const pageCount = useDocumentStore((s) => s.pageCount);
  const started = usePageContentStore((s) => s.started);

  // New document: reset page state; start automatically unless the user turned that off.
  useEffect(() => {
    const content = usePageContentStore.getState();
    if (!pdf) content.reset();
    else content.init(pageCount, useSettingsStore.getState().autoDetect);
  }, [pdf, pageCount]);

  useEffect(() => {
    // Read the store directly: `started` from this render may still belong to the previous document.
    if (!pdf || !started || !usePageContentStore.getState().started) return;
    const detection = createDetectionClient();
    const handle = startDocumentProcessing({
      pageCount,
      getPage: (i) => pdf.getPage(i + 1),
      getCurrentPage: () => useViewerStore.getState().currentPage,
      onPageUpdate: (i, update) => usePageContentStore.getState().applyUpdate(i, update),
      detectLines: (lines) => detection.detect(lines),
    });
    return () => {
      handle.cancel();
      detection.dispose();
    };
  }, [pdf, pageCount, started]);
}
