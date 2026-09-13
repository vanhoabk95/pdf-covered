import type { KeyboardEvent, MouseEvent } from "react";
import { usePageMasks } from "../app/usePageMasks";
import { maskDisplay } from "../masking/maskGenerator";
import type { MaskRegion } from "../masking/types";
import { pdfBoxToViewport } from "../pdf/coordinateTransform";
import type { ViewportTransform } from "../pdf/types";
import { useMaskStore } from "../state/maskStore";
import { useSettingsStore } from "../state/settingsStore";

interface MaskOverlayProps {
  pageIndex: number;
  viewport: ViewportTransform;
}

/**
 * Independent mask layer above the canvas. Regions live in PDF user space and are projected
 * with `viewport` on every render, so zoom/resize never misaligns them and toggling masks
 * never re-renders the PDF canvas.
 */
export function MaskOverlay({ pageIndex, viewport }: MaskOverlayProps) {
  const masks = usePageMasks(pageIndex);
  const masksEnabled = useMaskStore((s) => s.masksEnabled);
  const highlightKey = useMaskStore((s) => s.highlightKey);
  const openInspector = useMaskStore((s) => s.openInspector);
  const thresholds = useSettingsStore((s) => s.thresholds);
  const showUncertain = useSettingsStore((s) => s.showUncertain);
  const opacity = useSettingsStore((s) => s.maskOpacity);

  const open = (mask: MaskRegion, anchor: { x: number; y: number }) =>
    openInspector({ key: mask.key, pageIndex, anchor });

  return (
    <svg
      className="mask-layer"
      width={viewport.width}
      height={viewport.height}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      data-page-index={pageIndex}
    >
      {masksEnabled &&
        masks.map((mask) => {
          const display = maskDisplay(mask, thresholds, showUncertain);
          if (display === "hidden") return null;
          const r = pdfBoxToViewport(mask.bbox, viewport);
          const percent = Math.round(mask.confidence * 100);
          const label =
            display === "uncertain"
              ? `Uncertain Vietnamese region, ${percent}%`
              : mask.status === "manual"
                ? "Manual mask"
                : `Vietnamese region, ${percent}%`;
          const onClick = (e: MouseEvent) => {
            e.stopPropagation();
            open(mask, { x: e.clientX, y: e.clientY });
          };
          const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            open(mask, { x: rect.left, y: rect.bottom });
          };
          return (
            <g
              key={mask.key}
              className={`mask mask-${display} ${highlightKey === mask.key ? "mask-flash" : ""}`}
              data-mask-key={mask.key}
              data-line-id={mask.lineId}
              data-status={mask.status}
              role="button"
              tabIndex={0}
              aria-label={label}
              onClick={onClick}
              onKeyDown={onKeyDown}
            >
              <title>{label}</title>
              <rect
                x={r.x}
                y={r.y}
                width={r.width}
                height={r.height}
                style={display === "solid" ? { opacity } : undefined}
              />
              {display === "uncertain" && r.height >= 8 && (
                <text x={r.x + r.width + 4} y={r.y + Math.min(r.height, 12) - 2} className="mask-percent">
                  {percent}%
                </text>
              )}
            </g>
          );
        })}
    </svg>
  );
}
