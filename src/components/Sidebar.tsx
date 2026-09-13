import { useState } from "react";
import { useDocumentMasks, type ResolvedMask } from "../app/useDocumentMasks";
import { useDocumentStore } from "../state/documentStore";
import { useMaskStore } from "../state/maskStore";
import { usePageContentStore, type PageContent } from "../state/pageContentStore";
import { useSettingsStore } from "../state/settingsStore";
import { useViewerStore } from "../state/viewerStore";

type Tab = "pages" | "results";

const SNIPPET = 48;

/** Document summary, per-page status and the detection results list (spec §17–§18). */
export function Sidebar({ onStartDetection }: { onStartDetection(): void }) {
  const fileName = useDocumentStore((s) => s.fileName);
  const pageCount = useDocumentStore((s) => s.pageCount);
  const pages = usePageContentStore((s) => s.pages);
  const detectionStarted = usePageContentStore((s) => s.started);
  const summary = useDocumentMasks();
  const [tab, setTab] = useState<Tab>("pages");

  const processed = pages.filter((p) => p.state === "ready" || p.state === "error").length;
  const analyzing = detectionStarted && processed < pageCount;
  const noTextPages = pages.filter((p) => p.state === "ready" && p.noTextLayer && !p.ocr && !p.ocrError).length;
  const ocrFailedPages = pages.filter((p) => p.state === "ready" && p.ocrError).length;

  return (
    <aside className="sidebar" aria-label="Document sidebar">
      <section className="sidebar-section">
        <h2 className="sidebar-heading">Document</h2>
        <p className="sidebar-filename" title={fileName ?? undefined}>
          {fileName}
        </p>
        <p className="sidebar-meta">
          {pageCount} {pageCount === 1 ? "page" : "pages"}
          {analyzing && ` · analyzing ${processed}/${pageCount}`}
        </p>
        {!detectionStarted && (
          <button className="btn btn-primary sidebar-action" onClick={onStartDetection}>
            Detect Vietnamese
          </button>
        )}
      </section>

      <section className="sidebar-section" aria-label="Detection summary">
        <h2 className="sidebar-heading">Detection</h2>
        <dl className="summary">
          <dt>Vietnamese regions</dt>
          <dd data-testid="count-vietnamese">{summary.vietnamese}</dd>
          <dt>Uncertain regions</dt>
          <dd data-testid="count-uncertain">{summary.uncertain}</dd>
          <dt>Ignored regions</dt>
          <dd data-testid="count-ignored">{summary.ignored}</dd>
          {summary.manual > 0 && (
            <>
              <dt>Manual masks</dt>
              <dd data-testid="count-manual">{summary.manual}</dd>
            </>
          )}
        </dl>
        {noTextPages > 0 && (
          <p className="sidebar-warning">
            {noTextPages} {noTextPages === 1 ? "page has" : "pages have"} no text layer and {noTextPages === 1 ? "was" : "were"} not
            analyzed. Enable OCR in Settings to scan them.
          </p>
        )}
        {ocrFailedPages > 0 && (
          <p className="sidebar-warning" role="alert">
            OCR failed on {ocrFailedPages} {ocrFailedPages === 1 ? "page" : "pages"}. Their content was not analyzed; use
            manual masks there.
          </p>
        )}
      </section>

      <div className="sidebar-tabs segmented" role="tablist">
        <button role="tab" aria-selected={tab === "pages"} className={tab === "pages" ? "active" : ""} onClick={() => setTab("pages")}>
          Pages
        </button>
        <button
          role="tab"
          aria-selected={tab === "results"}
          className={tab === "results" ? "active" : ""}
          onClick={() => setTab("results")}
        >
          Results
        </button>
      </div>

      <section className="sidebar-section sidebar-scroll">
        {tab === "pages" ? <PageList pages={pages} byPage={summary.byPage} /> : <ResultList byPage={summary.byPage} />}
      </section>
    </aside>
  );
}

function PageList({ pages, byPage }: { pages: PageContent[]; byPage: ResolvedMask[][] }) {
  const pageCount = useDocumentStore((s) => s.pageCount);
  const currentPage = useViewerStore((s) => s.currentPage);
  const goToPage = useViewerStore((s) => s.goToPage);

  return (
    <ul className="plain-list">
      {Array.from({ length: pageCount }, (_, i) => (
        <li key={i}>
          <button
            className={`page-row ${i === currentPage ? "active" : ""}`}
            onClick={() => goToPage(i)}
            aria-current={i === currentPage ? "page" : undefined}
          >
            <span>Page {i + 1}</span>
            <PageStatus page={pages[i]} masks={byPage[i] ?? []} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function PageStatus({ page, masks }: { page: PageContent | undefined; masks: ResolvedMask[] }) {
  if (!page || page.state === "pending") return <span className="page-status muted">·</span>;
  if (page.state === "extracting" || page.state === "detecting" || page.state === "ocr") {
    return <span className="page-status spinner" aria-label={page.state === "ocr" ? "Running OCR" : "Analyzing"} />;
  }
  if (page.state === "error") return <span className="page-status error">Error</span>;
  if (page.ocrError) {
    return (
      <span className="page-status error" title={page.ocrError}>
        OCR failed
      </span>
    );
  }
  if (page.noTextLayer && !page.ocr) {
    return (
      <span className="page-status muted" title="No text layer (scanned?)">
        No text
      </span>
    );
  }
  const detected = masks.filter((m) => m.tier === "auto").length;
  const uncertain = masks.filter((m) => m.tier === "uncertain").length;
  return (
    <span className="page-status count" title={`${detected} Vietnamese, ${uncertain} uncertain`}>
      {page.ocr && <span className="page-status-ocr">OCR </span>}
      {detected}
      {uncertain > 0 && <span className="page-status-uncertain"> +{uncertain}?</span>}
    </span>
  );
}

function ResultList({ byPage }: { byPage: ResolvedMask[][] }) {
  const goToPage = useViewerStore((s) => s.goToPage);
  const { flash, setOverride } = useMaskStore.getState();
  const uncertainThreshold = useSettingsStore((s) => s.thresholds.uncertain);

  const groups = byPage
    .map((masks, pageIndex) => ({
      pageIndex,
      rows: masks
        .filter(({ mask, tier }) => tier !== "none" || (mask.status === "ignored" && mask.confidence >= uncertainThreshold))
        .sort((a, b) => b.mask.bbox.y + b.mask.bbox.height - (a.mask.bbox.y + a.mask.bbox.height)),
    }))
    .filter((g) => g.rows.length);

  if (!groups.length) return <p className="sidebar-empty">No Vietnamese regions detected yet.</p>;

  const show = ({ mask }: ResolvedMask) => {
    goToPage(mask.pageIndex, mask.bbox);
    flash(mask.key);
  };

  return (
    <div className="results" role="list" aria-label="Detection results">
      {groups.map((group) => (
        <div key={group.pageIndex} className="result-group">
          <h3 className="result-page">Page {group.pageIndex + 1}</h3>
          {group.rows.map((row) => {
            const { mask, tier } = row;
            const ignored = mask.status === "ignored";
            const text = mask.status === "manual" ? "Manual mask" : mask.sourceText;
            return (
              <div key={mask.key} role="listitem" className={`result-row tier-${tier} ${ignored ? "ignored" : ""}`}>
                <button className="result-main" onClick={() => show(row)} title={text}>
                  <span className="result-confidence">
                    {mask.status === "manual" ? "—" : `${Math.round(mask.confidence * 100)}%`}
                  </span>
                  <span className="result-text">{text.length > SNIPPET ? `${text.slice(0, SNIPPET)}…` : text}</span>
                </button>
                {ignored && (
                  <button className="result-restore" onClick={() => setOverride(mask.key, null)} title="Restore detection">
                    Restore
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
