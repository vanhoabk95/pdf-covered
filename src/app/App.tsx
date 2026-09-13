import { useCallback, useEffect, useState } from "react";
import { DebugPanel } from "../components/DebugPanel";
import { ErrorDialog, PasswordDialog } from "../components/Dialogs";
import { EmptyState } from "../components/EmptyState";
import { MaskInspector } from "../components/MaskInspector";
import { PdfViewer } from "../components/PdfViewer";
import { Sidebar } from "../components/Sidebar";
import { Toolbar } from "../components/Toolbar";
import { onPdfDrop, pickPdf, type OpenedFile } from "../platform/fileIO";
import { useDebugStore } from "../state/debugStore";
import { useDocumentStore } from "../state/documentStore";
import { useMaskStore } from "../state/maskStore";
import { useViewerStore } from "../state/viewerStore";
import { log } from "./log";
import { resolveShortcut } from "./shortcuts";
import { useDocumentProcessing } from "./useDocumentProcessing";

export function App() {
  const status = useDocumentStore((s) => s.status);
  const [dropHover, setDropHover] = useState(false);
  useDocumentProcessing();

  const openFile = useCallback((file: Promise<OpenedFile> | OpenedFile) => {
    useViewerStore.getState().reset();
    useMaskStore.getState().reset();
    void useDocumentStore.getState().openFile(file);
  }, []);

  const openDialog = useCallback(async () => {
    try {
      const file = await pickPdf();
      if (file) openFile(file);
    } catch (err) {
      log.error("open dialog failed", err);
      openFile(Promise.reject(err));
    }
  }, [openFile]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onPdfDrop(openFile, setDropHover).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [openFile]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inTextField = !!target?.closest("input, textarea, [contenteditable='true']");
      const action = resolveShortcut({ ...pick(e), inTextField });
      if (!action) return;

      const docReady = useDocumentStore.getState().status === "ready";
      const viewer = useViewerStore.getState();
      if (action !== "open" && action !== "toggle-debug" && !docReady) return;
      e.preventDefault();
      switch (action) {
        case "open":
          void openDialog();
          break;
        case "toggle-debug":
          useDebugStore.getState().toggle();
          break;
        case "toggle-masks":
          useMaskStore.getState().toggleMasks();
          break;
        case "undo":
          useMaskStore.getState().undo();
          break;
        case "redo":
          useMaskStore.getState().redo();
          break;
        case "zoom-in":
          viewer.zoomStep(1);
          break;
        case "zoom-out":
          viewer.zoomStep(-1);
          break;
        case "fit-page":
          viewer.setFitMode("page");
          break;
        case "prev-page":
          viewer.goToPage(Math.max(0, viewer.currentPage - 1));
          break;
        case "next-page":
          viewer.goToPage(Math.min(useDocumentStore.getState().pageCount - 1, viewer.currentPage + 1));
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openDialog]);

  const hasDocument = status === "ready";

  return (
    <div className="app">
      <Toolbar onOpen={openDialog} />
      <div className="app-body">
        {hasDocument && <Sidebar />}
        <main className="viewer">
          {hasDocument ? <PdfViewer /> : <EmptyState onOpen={openDialog} loading={status === "loading"} />}
        </main>
      </div>
      {dropHover && <div className="drop-overlay">Drop PDF to open</div>}
      {hasDocument && <MaskInspector />}
      {hasDocument && <DebugPanel />}
      {status === "password" && <PasswordDialog />}
      <ErrorDialog />
    </div>
  );
}

function pick(e: KeyboardEvent) {
  return { key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey };
}
