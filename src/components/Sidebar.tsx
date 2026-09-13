import { classifyConfidence } from "../masking/thresholds";
import { useDocumentStore } from "../state/documentStore";
import { usePageContentStore, type PageContent } from "../state/pageContentStore";
import { useViewerStore } from "../state/viewerStore";

/** Document + page list. Detection counts and results are added in Phase E. */
export function Sidebar() {
  const fileName = useDocumentStore((s) => s.fileName);
  const pageCount = useDocumentStore((s) => s.pageCount);
  const pages = usePageContentStore((s) => s.pages);
  const currentPage = useViewerStore((s) => s.currentPage);
  const goToPage = useViewerStore((s) => s.goToPage);
  const processed = pages.filter((p) => p.state === "ready" || p.state === "error").length;

  return (
    <aside className="sidebar">
      <section className="sidebar-section">
        <h2 className="sidebar-heading">Document</h2>
        <p className="sidebar-filename" title={fileName ?? undefined}>
          {fileName}
        </p>
        <p className="sidebar-meta">
          {pageCount} {pageCount === 1 ? "page" : "pages"}
          {processed < pageCount && ` · analyzing ${processed}/${pageCount}`}
        </p>
      </section>

      <section className="sidebar-section sidebar-pages">
        <h2 className="sidebar-heading">Pages</h2>
        <ul>
          {Array.from({ length: pageCount }, (_, i) => (
            <li key={i}>
              <button
                className={`page-row ${i === currentPage ? "active" : ""}`}
                onClick={() => goToPage(i)}
                aria-current={i === currentPage ? "page" : undefined}
              >
                <span>Page {i + 1}</span>
                <PageStatus page={pages[i]} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

function PageStatus({ page }: { page: PageContent | undefined }) {
  if (!page || page.state === "pending") return <span className="page-status muted">·</span>;
  if (page.state === "extracting" || page.state === "detecting") {
    return <span className="page-status spinner" aria-label="Analyzing" />;
  }
  if (page.state === "error") return <span className="page-status error">Error</span>;
  if (page.noTextLayer) return <span className="page-status muted" title="No text layer (scanned?)">No text</span>;
  const detected = page.detections.filter((d) => classifyConfidence(d.confidence) === "auto").length;
  const uncertain = page.detections.filter((d) => classifyConfidence(d.confidence) === "uncertain").length;
  return (
    <span className="page-status count" title={`${detected} Vietnamese, ${uncertain} uncertain`}>
      {detected}
      {uncertain > 0 && <span className="page-status-uncertain"> +{uncertain}?</span>}
    </span>
  );
}
