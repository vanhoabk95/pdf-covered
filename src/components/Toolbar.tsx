import { useEffect, useState, type FormEvent } from "react";
import { sensitivityOf } from "../state/settings";
import { useDocumentStore } from "../state/documentStore";
import { selectCanRedo, selectCanUndo, useMaskStore } from "../state/maskStore";
import { useSettingsStore } from "../state/settingsStore";
import { useViewerStore } from "../state/viewerStore";
import { Icon } from "./Icon";

interface ToolbarProps {
  onOpen(): void;
  /** Omitted until export is available. */
  onExport?(): void;
  onOpenSettings(): void;
}

export function Toolbar({ onOpen, onExport, onOpenSettings }: ToolbarProps) {
  const ready = useDocumentStore((s) => s.status === "ready");
  const pageCount = useDocumentStore((s) => s.pageCount);
  const zoom = useViewerStore((s) => s.zoom);
  const fitMode = useViewerStore((s) => s.fitMode);
  const currentPage = useViewerStore((s) => s.currentPage);
  const tool = useViewerStore((s) => s.tool);
  const { zoomStep, setFitMode, goToPage, setTool } = useViewerStore.getState();
  const masksEnabled = useMaskStore((s) => s.masksEnabled);
  const canUndo = useMaskStore(selectCanUndo);
  const canRedo = useMaskStore(selectCanRedo);
  const { toggleMasks, undo, redo } = useMaskStore.getState();
  const thresholds = useSettingsStore((s) => s.thresholds);
  const showUncertain = useSettingsStore((s) => s.showUncertain);
  const { setSensitivity, update } = useSettingsStore.getState();
  const sensitivity = sensitivityOf(thresholds);

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <button className="btn" onClick={onOpen} title="Open PDF (Ctrl+O)">
          <Icon name="open" />
          <span>Open</span>
        </button>
      </div>

      <div className="toolbar-group">
        <button className="btn-icon" disabled={!ready} onClick={() => zoomStep(-1)} title="Zoom out (Ctrl+−)" aria-label="Zoom out">
          <Icon name="minus" />
        </button>
        <span className="zoom-value" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <button className="btn-icon" disabled={!ready} onClick={() => zoomStep(1)} title="Zoom in (Ctrl++)" aria-label="Zoom in">
          <Icon name="plus" />
        </button>
        <div className="segmented">
          <button className={fitMode === "width" ? "active" : ""} disabled={!ready} onClick={() => setFitMode("width")}>
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
          aria-label="Previous page"
        >
          <Icon name="chevron-up" />
        </button>
        <PageInput disabled={!ready} currentPage={currentPage} pageCount={pageCount} onSubmit={(p) => goToPage(p)} />
        <button
          className="btn-icon"
          disabled={!ready || currentPage >= pageCount - 1}
          onClick={() => goToPage(currentPage + 1)}
          title="Next page"
          aria-label="Next page"
        >
          <Icon name="chevron-down" />
        </button>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        <button
          className={`btn-icon ${tool === "manual-mask" ? "pressed" : ""}`}
          disabled={!ready}
          aria-pressed={tool === "manual-mask"}
          onClick={() => setTool(tool === "manual-mask" ? "select" : "manual-mask")}
          title="Draw a manual mask (drag on the page, Esc to finish)"
          aria-label="Manual mask tool"
        >
          <Icon name="rect" />
        </button>
        <label className="select-label" title="Detection sensitivity">
          <span className="visually-hidden">Sensitivity</span>
          <select
            aria-label="Sensitivity"
            disabled={!ready}
            value={sensitivity}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "custom") onOpenSettings();
              else setSensitivity(value as "high" | "normal" | "strict");
            }}
          >
            <option value="high">High sensitivity</option>
            <option value="normal">Normal</option>
            <option value="strict">Strict</option>
            <option value="custom">{sensitivity === "custom" ? `Custom (${Math.round(thresholds.auto * 100)}%)` : "Custom…"}</option>
          </select>
        </label>
        <label className="check-label" title="Show regions with 60–85% confidence">
          <input
            type="checkbox"
            checked={showUncertain}
            disabled={!ready}
            onChange={(e) => update({ showUncertain: e.target.checked })}
          />
          Uncertain
        </label>
      </div>

      <div className="toolbar-group">
        <button className="btn-icon" disabled={!ready || !canUndo} onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Icon name="undo" />
        </button>
        <button className="btn-icon" disabled={!ready || !canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
          <Icon name="redo" />
        </button>
        <label className={`switch ${!ready ? "disabled" : ""}`} title="Temporary visual mask (Ctrl+Shift+M)">
          <span>Hide Vietnamese</span>
          <input
            type="checkbox"
            role="switch"
            checked={masksEnabled}
            disabled={!ready}
            onChange={toggleMasks}
            aria-label="Vietnamese masking"
          />
          <span className="switch-track" aria-hidden />
        </label>
      </div>

      <div className="toolbar-group">
        <button className="btn-icon" onClick={onOpenSettings} title="Settings" aria-label="Settings">
          <Icon name="gear" />
        </button>
        {onExport && (
          <button className="btn btn-primary" disabled={!ready} onClick={onExport} title="Permanently remove hidden content (Ctrl+E)">
            Export Redacted PDF
          </button>
        )}
      </div>
    </header>
  );
}

function PageInput(props: { disabled: boolean; currentPage: number; pageCount: number; onSubmit(pageIndex: number): void }) {
  const [draft, setDraft] = useState(String(props.currentPage + 1));
  useEffect(() => setDraft(String(props.currentPage + 1)), [props.currentPage]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number.parseInt(draft, 10);
    if (Number.isFinite(n) && props.pageCount > 0) props.onSubmit(Math.min(Math.max(n, 1), props.pageCount) - 1);
    else setDraft(String(props.currentPage + 1));
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
