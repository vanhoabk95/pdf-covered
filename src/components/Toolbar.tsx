import { useEffect, useState, type FormEvent } from "react";
import { useDocumentStore } from "../state/documentStore";
import { useViewerStore } from "../state/viewerStore";
import { Icon } from "./Icon";

interface ToolbarProps {
  onOpen(): void;
}

export function Toolbar({ onOpen }: ToolbarProps) {
  const ready = useDocumentStore((s) => s.status === "ready");
  const pageCount = useDocumentStore((s) => s.pageCount);
  const zoom = useViewerStore((s) => s.zoom);
  const fitMode = useViewerStore((s) => s.fitMode);
  const currentPage = useViewerStore((s) => s.currentPage);
  const { zoomStep, setFitMode, goToPage } = useViewerStore.getState();

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <button className="btn" onClick={onOpen} title="Open PDF (Ctrl+O)">
          <Icon name="open" />
          <span>Open</span>
        </button>
      </div>

      <div className="toolbar-group" aria-disabled={!ready}>
        <button className="btn-icon" disabled={!ready} onClick={() => zoomStep(-1)} title="Zoom out (Ctrl+−)">
          <Icon name="minus" />
        </button>
        <span className="zoom-value" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <button className="btn-icon" disabled={!ready} onClick={() => zoomStep(1)} title="Zoom in (Ctrl++)">
          <Icon name="plus" />
        </button>
        <div className="segmented">
          <button
            className={fitMode === "width" ? "active" : ""}
            disabled={!ready}
            onClick={() => setFitMode("width")}
            title="Fit width"
          >
            Fit width
          </button>
          <button
            className={fitMode === "page" ? "active" : ""}
            disabled={!ready}
            onClick={() => setFitMode("page")}
            title="Fit page (Ctrl+0)"
          >
            Fit page
          </button>
        </div>
      </div>

      <div className="toolbar-group">
        <button
          className="btn-icon"
          disabled={!ready || currentPage <= 0}
          onClick={() => goToPage(currentPage - 1)}
          title="Previous page"
        >
          <Icon name="chevron-up" />
        </button>
        <PageInput
          disabled={!ready}
          currentPage={currentPage}
          pageCount={pageCount}
          onSubmit={(p) => goToPage(p)}
        />
        <button
          className="btn-icon"
          disabled={!ready || currentPage >= pageCount - 1}
          onClick={() => goToPage(currentPage + 1)}
          title="Next page"
        >
          <Icon name="chevron-down" />
        </button>
      </div>

      <div className="toolbar-spacer" />
    </header>
  );
}

function PageInput(props: {
  disabled: boolean;
  currentPage: number;
  pageCount: number;
  onSubmit(pageIndex: number): void;
}) {
  const [draft, setDraft] = useState(String(props.currentPage + 1));
  useEffect(() => setDraft(String(props.currentPage + 1)), [props.currentPage]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number.parseInt(draft, 10);
    if (Number.isFinite(n) && props.pageCount > 0) {
      props.onSubmit(Math.min(Math.max(n, 1), props.pageCount) - 1);
    } else {
      setDraft(String(props.currentPage + 1));
    }
  };

  return (
    <form className="page-input" onSubmit={submit}>
      <input
        aria-label="Page number"
        inputMode="numeric"
        disabled={props.disabled}
        value={props.pageCount ? draft : ""}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={submit}
      />
      <span>/ {props.pageCount || "–"}</span>
    </form>
  );
}
