import { RenderingCancelledException, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import { memo, useEffect, useRef, useState } from "react";
import { log } from "../app/log";
import { CSS_PX_PER_PT, createViewportTransform } from "../pdf/coordinateTransform";
import type { PageGeometry } from "../pdf/types";
import { DebugOverlay } from "./DebugOverlay";
import { MaskOverlay } from "./MaskOverlay";

/** Largest backing canvas we allow (pixels) before lowering render resolution. */
const MAX_CANVAS_PIXELS = 16_777_216;
/** Delay before re-rendering after a zoom change, so rapid zooming stays smooth. */
const RERENDER_DELAY_MS = 120;

interface PdfPageProps {
  pdf: PDFDocumentProxy;
  pageIndex: number;
  geometry: PageGeometry;
  zoom: number;
}

/**
 * One page, rendered as independent layers:
 *   canvas (PDF.js) → mask overlay (SVG).
 * Changing masks never touches the canvas; changing zoom stretches the old canvas
 * via CSS until the sharper render is ready, then swaps it in.
 */
export const PdfPage = memo(function PdfPage({ pdf, pageIndex, geometry, zoom }: PdfPageProps) {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const vt = createViewportTransform(geometry, zoom);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    let cancelled = false;
    let task: RenderTask | null = null;

    const render = async () => {
      const page = await pdf.getPage(pageIndex + 1);
      if (cancelled) return;

      const cssScale = zoom * CSS_PX_PER_PT;
      const cssViewport = page.getViewport({ scale: cssScale });
      const dpr = window.devicePixelRatio || 1;
      const cssArea = cssViewport.width * cssViewport.height;
      const outputScale = Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(cssArea, 1)));
      const viewport = page.getViewport({ scale: cssScale * outputScale });

      const canvas = document.createElement("canvas");
      canvas.className = "pdf-page-canvas";
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      task = page.render({ canvas, viewport });
      await task.promise;
      if (cancelled) return;
      host.replaceChildren(canvas);
      setError(null);
    };

    const delay = host.firstChild ? RERENDER_DELAY_MS : 0;
    const timer = window.setTimeout(() => {
      render().catch((err) => {
        if (cancelled || err instanceof RenderingCancelledException) return;
        log.error(`page ${pageIndex + 1} render failed`, err);
        setError("This page could not be rendered.");
      });
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      task?.cancel();
    };
  }, [pdf, pageIndex, zoom]);

  return (
    <div className="pdf-page" style={{ width: vt.width, height: vt.height }} data-page-index={pageIndex}>
      <div ref={canvasHostRef} className="pdf-page-canvas-host" />
      <MaskOverlay pageIndex={pageIndex} viewport={vt} />
      <DebugOverlay pageIndex={pageIndex} viewport={vt} />
      {error && <div className="pdf-page-error">{error}</div>}
    </div>
  );
});
