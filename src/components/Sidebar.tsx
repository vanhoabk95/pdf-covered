import { useDocumentStore } from "../state/documentStore";
import { useViewerStore } from "../state/viewerStore";

/** Document + page list. Detection counts and results are added in Phase E. */
export function Sidebar() {
  const fileName = useDocumentStore((s) => s.fileName);
  const pageCount = useDocumentStore((s) => s.pageCount);
  const currentPage = useViewerStore((s) => s.currentPage);
  const goToPage = useViewerStore((s) => s.goToPage);

  return (
    <aside className="sidebar">
      <section className="sidebar-section">
        <h2 className="sidebar-heading">Document</h2>
        <p className="sidebar-filename" title={fileName ?? undefined}>
          {fileName}
        </p>
        <p className="sidebar-meta">
          {pageCount} {pageCount === 1 ? "page" : "pages"}
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
                Page {i + 1}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
