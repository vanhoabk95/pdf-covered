import { useDebugStore, type DebugLayers } from "../state/debugStore";
import { usePageContentStore } from "../state/pageContentStore";
import { useViewerStore } from "../state/viewerStore";

const layerLabels: [keyof DebugLayers, string][] = [
  ["showItems", "Raw text boxes"],
  ["showLines", "Grouped line boxes"],
  ["showLineText", "Line text"],
  ["showCoordinates", "PDF coordinates"],
];

export function DebugPanel() {
  const debug = useDebugStore();
  const currentPage = useViewerStore((s) => s.currentPage);
  const page = usePageContentStore((s) => s.pages[currentPage]);
  if (!debug.enabled) return null;

  return (
    <div className="debug-panel" role="region" aria-label="Debug">
      <div className="debug-panel-title">
        Debug
        <button className="btn-icon" onClick={debug.toggle} title="Close (Ctrl+Shift+D)">
          ×
        </button>
      </div>
      {layerLabels.map(([key, label]) => (
        <label key={key} className="debug-check">
          <input type="checkbox" checked={debug[key]} onChange={(e) => debug.setLayer(key, e.target.checked)} />
          {label}
        </label>
      ))}
      {page && (
        <dl className="debug-stats">
          <dt>Page</dt>
          <dd>{currentPage + 1}</dd>
          <dt>State</dt>
          <dd>{page.state}</dd>
          <dt>Text items</dt>
          <dd>{page.items.length}</dd>
          <dt>Lines</dt>
          <dd>{page.lines.length}</dd>
          {page.timings && (
            <>
              <dt>Extract / group</dt>
              <dd>
                {page.timings.extractMs} / {page.timings.groupMs} ms
              </dd>
            </>
          )}
          {page.noTextLayer && (
            <>
              <dt>Text layer</dt>
              <dd>none (OCR candidate)</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
