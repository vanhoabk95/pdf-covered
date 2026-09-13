import type { PdfTextItem } from "../pdf/types";

let counter = 0;

/** Synthetic text item for unit tests. `x`/`y` are the baseline origin. */
export function makeItem(
  spec: {
    text: string;
    x: number;
    y: number;
    size?: number;
    rotation?: number;
    advance?: number;
    dir?: PdfTextItem["dir"];
    pageIndex?: number;
  },
): PdfTextItem {
  const size = spec.size ?? 10;
  const advance = spec.advance ?? spec.text.length * size * 0.5;
  const rotation = spec.rotation ?? 0;
  const t = (rotation * Math.PI) / 180;
  const [cos, sin] = [Math.cos(t), Math.sin(t)];
  const ascent = size * 0.8;
  const descent = size * 0.2;
  const corners = [
    [0, -descent],
    [advance, -descent],
    [0, ascent],
    [advance, ascent],
  ].map(([u, v]) => [spec.x + u * cos - v * sin, spec.y + u * sin + v * cos]);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const index = counter++;
  return {
    id: `t${index}`,
    pageIndex: spec.pageIndex ?? 0,
    itemIndex: index,
    text: spec.text,
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    fontSize: size,
    rotation,
    baselineX: spec.x,
    baselineY: spec.y,
    advance,
    ascent,
    descent,
    dir: spec.dir ?? "ltr",
    fontName: "f1",
    hasEOL: false,
    transform: [size * cos, size * sin, -size * sin, size * cos, spec.x, spec.y],
  };
}
