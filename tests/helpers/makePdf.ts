import { degrees, PDFDocument, PDFName, PDFNumber, StandardFonts } from "pdf-lib";

export interface TestPageSpec {
  size?: [number, number];
  /** Custom MediaBox [x0, y0, x1, y1]; overrides size. */
  mediaBox?: [number, number, number, number];
  rotate?: 0 | 90 | 180 | 270;
  userUnit?: number;
  lines?: { text: string; x: number; y: number; size?: number }[];
}

/** Builds a small in-memory PDF for tests (ASCII text only — Vietnamese fixtures come later). */
export async function makePdf(pages: TestPageSpec[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const spec of pages) {
    const page = doc.addPage(spec.size ?? [612, 792]);
    if (spec.mediaBox) {
      const [x0, y0, x1, y1] = spec.mediaBox;
      page.setMediaBox(x0, y0, x1 - x0, y1 - y0);
    }
    if (spec.rotate) page.setRotation(degrees(spec.rotate));
    if (spec.userUnit) page.node.set(PDFName.of("UserUnit"), PDFNumber.of(spec.userUnit));
    for (const line of spec.lines ?? []) {
      page.drawText(line.text, { x: line.x, y: line.y, size: line.size ?? 12, font });
    }
  }
  return doc.save({ useObjectStreams: false });
}
