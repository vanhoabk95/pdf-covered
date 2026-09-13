import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  anchorFromScroll,
  clampZoom,
  computeFitZoom,
  computeLayout,
  currentPageAt,
  PAGE_MARGIN,
  scrollFromAnchor,
  visiblePageRange,
  type DocumentLayout,
} from "../pdf/layout";
import { createViewportTransform, pdfBoxToViewport } from "../pdf/coordinateTransform";
import { useDocumentStore } from "../state/documentStore";
import { useViewerStore } from "../state/viewerStore";
import { PdfPage } from "./PdfPage";

/** Virtualized vertical page list: only pages near the viewport are mounted. */
export function PdfViewer() {
  const pdf = useDocumentStore((s) => s.pdf);
  const geometries = useDocumentStore((s) => s.geometries);
  const zoom = useViewerStore((s) => s.zoom);
  const fitMode = useViewerStore((s) => s.fitMode);
  const navigation = useViewerStore((s) => s.navigation);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);

  const layout = useMemo(() => computeLayout(geometries, zoom), [geometries, zoom]);

  // Track container size (window resize, sidebar toggle).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit modes follow the container size.
  useEffect(() => {
    if (!fitMode || !size.width) return;
    const { currentPage, applyFitZoom } = useViewerStore.getState();
    applyFitZoom(computeFitZoom(fitMode, geometries, currentPage, size));
  }, [fitMode, geometries, size]);

  // Keep the same content under the viewport top when zoom changes.
  const prevLayoutRef = useRef<DocumentLayout | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const prev = prevLayoutRef.current;
    prevLayoutRef.current = layout;
    if (!el || !prev || prev === layout || prev.slots.length !== layout.slots.length) return;
    const anchor = anchorFromScroll(prev, el.scrollTop);
    const hRatio = el.scrollWidth > el.clientWidth ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth : 0.5;
    el.scrollTop = scrollFromAnchor(layout, anchor);
    el.scrollLeft = Math.max(0, hRatio * el.scrollWidth - el.clientWidth / 2);
    setScrollTop(el.scrollTop);
  }, [layout]);

  // Explicit navigation (page input, sidebar, keyboard).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !navigation) return;
    const slot = layout.slots[navigation.pageIndex];
    if (!slot) return;
    if (!navigation.focus) {
      el.scrollTop = slot.top - PAGE_MARGIN / 2;
      return;
    }
    // Center the focused region horizontally and place it a third down the viewport.
    const vt = createViewportTransform(geometries[navigation.pageIndex], useViewerStore.getState().zoom);
    const box = pdfBoxToViewport(navigation.focus, vt);
    const pageLeft = (Math.max(layout.maxWidth + PAGE_MARGIN * 2, el.clientWidth) - slot.width) / 2;
    el.scrollTop = Math.max(0, slot.top + box.y - el.clientHeight / 3);
    el.scrollLeft = Math.max(0, pageLeft + box.x + box.width / 2 - el.clientWidth / 2);
    // Only react to new navigation requests, not to layout changes.
  }, [navigation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl/Cmd + wheel and trackpad pinch zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const { zoom: z, setZoom } = useViewerStore.getState();
      setZoom(clampZoom(z * Math.exp(-e.deltaY * 0.01)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const frame = useRef(0);
  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      setScrollTop(el.scrollTop);
      useViewerStore.getState().setCurrentPage(currentPageAt(layout, el.scrollTop, el.clientHeight));
    });
  };

  const { start, end } = visiblePageRange(layout, scrollTop, size.height || 800, 1);
  const contentWidth = Math.max(layout.maxWidth + PAGE_MARGIN * 2, size.width);

  return (
    <div ref={scrollRef} className="viewer-scroll" onScroll={onScroll}>
      <div className="viewer-content" style={{ height: layout.totalHeight, width: contentWidth }}>
        {pdf &&
          layout.slots.slice(start, end + 1).map((slot) => (
            <div
              key={slot.pageIndex}
              className="page-slot"
              style={{ top: slot.top, left: (contentWidth - slot.width) / 2 }}
            >
              <PdfPage pdf={pdf} pageIndex={slot.pageIndex} geometry={geometries[slot.pageIndex]} zoom={zoom} />
            </div>
          ))}
      </div>
    </div>
  );
}
