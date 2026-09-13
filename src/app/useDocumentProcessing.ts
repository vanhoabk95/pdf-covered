import { useEffect } from "react";
import { startDocumentProcessing } from "../pipeline/documentProcessor";
import { useDocumentStore } from "../state/documentStore";
import { usePageContentStore } from "../state/pageContentStore";
import { useViewerStore } from "../state/viewerStore";

/** Starts page processing whenever a document opens; cancels it when the document changes. */
export function useDocumentProcessing(): void {
  const pdf = useDocumentStore((s) => s.pdf);
  const pageCount = useDocumentStore((s) => s.pageCount);

  useEffect(() => {
    const content = usePageContentStore.getState();
    if (!pdf) {
      content.reset();
      return;
    }
    content.init(pageCount);
    const handle = startDocumentProcessing({
      pageCount,
      getPage: (i) => pdf.getPage(i + 1),
      getCurrentPage: () => useViewerStore.getState().currentPage,
      onPageUpdate: (i, update) => usePageContentStore.getState().applyUpdate(i, update),
    });
    return () => handle.cancel();
  }, [pdf, pageCount]);
}
