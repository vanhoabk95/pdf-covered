import { InvalidPDFException, PasswordException, PasswordResponses } from "pdfjs-dist";
import { describe, expect, it } from "vitest";
import { applyMatrix, createViewportTransform, CSS_PX_PER_PT } from "../src/pdf/coordinateTransform";
import { destroyPdf, loadPdf, PdfLoadError, readPageGeometries, toLoadError } from "../src/pdf/pdfLoader";
import { makePdf } from "./helpers/makePdf";

describe("loadPdf", () => {
  it("opens a multi-page PDF and reads geometry", async () => {
    const bytes = await makePdf([
      { size: [612, 792] },
      { size: [595, 842], rotate: 90 },
      { mediaBox: [50, 100, 450, 700] },
    ]);
    const { doc, pageCount } = await loadPdf(bytes);
    expect(pageCount).toBe(3);
    // Input bytes must not be detached by PDF.js.
    expect(bytes.byteLength).toBeGreaterThan(0);

    const geometries = await readPageGeometries(doc);
    expect(geometries[0]).toEqual({ viewBox: [0, 0, 612, 792], rotate: 0, userUnit: 1 });
    expect(geometries[1].rotate).toBe(90);
    expect(geometries[2].viewBox).toEqual([50, 100, 450, 700]);
    await destroyPdf(doc);
  });

  it("rejects corrupt data with a 'corrupt' error", async () => {
    const garbage = new TextEncoder().encode("%PDF-1.7\nthis is not really a pdf");
    await expect(loadPdf(garbage)).rejects.toMatchObject({ kind: "corrupt" });
  });

  it("rejects non-PDF data", async () => {
    await expect(loadPdf(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(PdfLoadError);
  });
});

describe("toLoadError", () => {
  it("maps password exceptions", () => {
    const need = new PasswordException("need", PasswordResponses.NEED_PASSWORD);
    const bad = new PasswordException("bad", PasswordResponses.INCORRECT_PASSWORD);
    expect(toLoadError(need).kind).toBe("password-required");
    expect(toLoadError(need, "tried").kind).toBe("password-incorrect");
    expect(toLoadError(bad, "x").kind).toBe("password-incorrect");
  });

  it("maps invalid PDF and unknown errors", () => {
    expect(toLoadError(new InvalidPDFException("x")).kind).toBe("corrupt");
    expect(toLoadError(new Error("Unsupported encryption algorithm")).kind).toBe("unsupported");
    expect(toLoadError("boom").kind).toBe("unknown");
  });
});

describe("viewport transform matches PDF.js", () => {
  it.each([
    { label: "portrait", spec: { size: [612, 792] as [number, number] } },
    { label: "rotated 90", spec: { size: [595, 842] as [number, number], rotate: 90 as const } },
    { label: "rotated 180", spec: { size: [595, 842] as [number, number], rotate: 180 as const } },
    { label: "rotated 270", spec: { size: [595, 842] as [number, number], rotate: 270 as const } },
    { label: "offset media box", spec: { mediaBox: [50, 100, 450, 700] as [number, number, number, number] } },
    { label: "user unit", spec: { size: [300, 400] as [number, number], userUnit: 2 } },
  ])("$label", async ({ spec }) => {
    const { doc } = await loadPdf(await makePdf([spec]));
    const [geometry] = await readPageGeometries(doc);
    const page = await doc.getPage(1);

    for (const zoom of [0.5, 1, 2.25]) {
      const ours = createViewportTransform(geometry, zoom);
      const theirs = page.getViewport({ scale: zoom * CSS_PX_PER_PT });
      expect(ours.width).toBeCloseTo(theirs.width, 6);
      expect(ours.height).toBeCloseTo(theirs.height, 6);
      for (const [x, y] of [
        [geometry.viewBox[0], geometry.viewBox[1]],
        [geometry.viewBox[2], geometry.viewBox[3]],
        [123.4, 567.8],
      ]) {
        const [ox, oy] = applyMatrix(ours.transform, x, y);
        const [tx, ty] = theirs.convertToViewportPoint(x, y);
        expect(ox).toBeCloseTo(tx, 6);
        expect(oy).toBeCloseTo(ty, 6);
      }
    }
    await destroyPdf(doc);
  });
});
