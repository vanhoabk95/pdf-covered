import { useRef, useState, type PointerEvent } from "react";
import { createManualMask } from "../masking/manualMask";
import type { PageGeometry, ViewportTransform } from "../pdf/types";
import { useMaskStore } from "../state/maskStore";
import { useViewerStore } from "../state/viewerStore";

interface ManualMaskLayerProps {
  pageIndex: number;
  viewport: ViewportTransform;
  geometry: PageGeometry;
}

/** Captures drags while the manual mask tool is active (spec §36). */
export function ManualMaskLayer({ pageIndex, viewport, geometry }: ManualMaskLayerProps) {
  const active = useViewerStore((s) => s.tool === "manual-mask");
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  if (!active) return null;

  const point = (e: PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const finish = () => {
    if (!drag) return;
    const mask = createManualMask(pageIndex, drag.start, drag.end, viewport, geometry);
    if (mask) useMaskStore.getState().addManualMask(mask);
    setDrag(null);
  };

  return (
    <div
      ref={ref}
      className="manual-mask-layer"
      data-page-index={pageIndex}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = point(e);
        setDrag({ start: p, end: p });
      }}
      onPointerMove={(e) => drag && setDrag({ ...drag, end: point(e) })}
      onPointerUp={finish}
      onPointerCancel={() => setDrag(null)}
    >
      {drag && (
        <div
          className="manual-mask-preview"
          style={{
            left: Math.min(drag.start.x, drag.end.x),
            top: Math.min(drag.start.y, drag.end.y),
            width: Math.abs(drag.end.x - drag.start.x),
            height: Math.abs(drag.end.y - drag.start.y),
          }}
        />
      )}
    </div>
  );
}
