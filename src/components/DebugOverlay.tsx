import { classifyConfidence } from "../masking/thresholds";
import { pdfBoxToViewport } from "../pdf/coordinateTransform";
import type { BoundingBox, ViewportTransform } from "../pdf/types";
import { useDebugStore } from "../state/debugStore";
import { usePageContentStore } from "../state/pageContentStore";

interface DebugOverlayProps {
  pageIndex: number;
  viewport: ViewportTransform;
}

const fmt = (b: BoundingBox) =>
  `${b.x.toFixed(1)},${b.y.toFixed(1)} ${b.width.toFixed(1)}×${b.height.toFixed(1)}`;

/** Development overlay: raw text item boxes, grouped line boxes, language confidence and coordinates. */
export function DebugOverlay({ pageIndex, viewport }: DebugOverlayProps) {
  const enabled = useDebugStore((s) => s.enabled);
  const { showItems, showLines, showLineText, showConfidence, showCoordinates } = useDebugStore();
  const content = usePageContentStore((s) => s.pages[pageIndex]);
  if (!enabled || !content) return null;

  const detectionByLine = new Map(content.detections.map((d) => [d.lineId, d]));

  return (
    <svg
      className="debug-layer"
      width={viewport.width}
      height={viewport.height}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      aria-hidden
    >
      {showItems &&
        content.items.map((item) => {
          const r = pdfBoxToViewport(item, viewport);
          return <rect key={item.id} className="debug-item" x={r.x} y={r.y} width={r.width} height={r.height} />;
        })}
      {showLines &&
        content.lines.map((line) => {
          const r = pdfBoxToViewport(line.bbox, viewport);
          const detection = detectionByLine.get(line.id);
          const tier = detection ? classifyConfidence(detection.confidence) : "pending";
          const labels = [
            showConfidence && detection
              ? `${detection.language.toUpperCase()} ${detection.confidence.toFixed(2)}`
              : null,
            showLineText ? line.text : null,
            showCoordinates ? `pdf ${fmt(line.bbox)}  rot ${line.rotation.toFixed(0)}°` : null,
          ].filter(Boolean);
          return (
            <g key={line.id} className={`debug-tier-${tier}`} data-line-id={line.id}>
              <rect className="debug-line" x={r.x} y={r.y} width={r.width} height={r.height} />
              {labels.map((label, i) => (
                <text key={i} className="debug-label" x={r.x} y={r.y + r.height + 9 + i * 10}>
                  {label}
                </text>
              ))}
            </g>
          );
        })}
    </svg>
  );
}
