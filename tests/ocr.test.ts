import { afterAll, describe, expect, it } from "vitest";
import { planRedaction } from "../src/export/plan";
import { redactPdf } from "../src/export/redactPdf";
import { mergeReports, validateWithMupdf } from "../src/export/validateRedaction";
import { validateWithPdfjs } from "../src/export/validateWithPdfjs";
import { resolvePageMasks } from "../src/masking/pageMasks";
import { DEFAULT_MASK_PADDING, effectiveTier } from "../src/masking/maskGenerator";
import { DEFAULT_THRESHOLDS } from "../src/masking/thresholds";
import { startDocumentProcessing, type PageContentUpdate } from "../src/pipeline/documentProcessor";
import { destroyPdf, loadPdf, readPageGeometries } from "../src/pdf/pdfLoader";
import { createInlineDetectionClient } from "../src/workers/detectionClient";
import { buildFixture, getFixture } from "./helpers/fixtures";
import { createNodeOcrEngine, nodeOcrDependency, recognizeWithMupdf } from "./helpers/ocr";

const engine = createNodeOcrEngine();
afterAll(() => engine.dispose());

const squash = (s: string) => s.normalize("NFC").replace(/\s+/g, "").toLowerCase();

async function processScanned(bytes: Uint8Array) {
  const { doc, pageCount } = await loadPdf(bytes);
  const geometries = await readPageGeometries(doc);
  const client = createInlineDetectionClient();
  const pages = new Map<number, PageContentUpdate>();
  await startDocumentProcessing({
    pageCount,
    getPage: (i) => doc.getPage(i + 1),
    getCurrentPage: () => 0,
    onPageUpdate: (i, u) => pages.set(i, u),
    detectLines: (lines) => client.detect(lines),
    ocr: nodeOcrDependency(engine, bytes),
    yieldToUi: async () => undefined,
  }).done;
  await destroyPdf(doc);
  const masksByPage = [...pages.keys()].sort().map((pageIndex) => {
    const page = pages.get(pageIndex)!;
    return resolvePageMasks({
      pageIndex,
      content: { lines: page.lines ?? [], detections: page.detections ?? [] },
      geometry: geometries[pageIndex],
      overrides: {},
      manual: [],
      revealed: {},
      padding: DEFAULT_MASK_PADDING,
      thresholds: DEFAULT_THRESHOLDS,
    });
  });
  return { pages, masksByPage };
}

describe("OCR for image-only pages (spec §22)", () => {
  it("recognizes Vietnamese and English text from a scanned page", async () => {
    const bytes = await buildFixture("scanned-mixed");
    const lines = await recognizeWithMupdf(engine, bytes, 0);
    const got = lines.map((l) => squash(l.text));
    const expected = getFixture("scanned-mixed").pages[0].lines.map((l) => squash(l.text));
    const exact = expected.filter((e) => got.includes(e));
    expect(exact.length, `OCR lines: ${JSON.stringify(lines.map((l) => l.text))}`).toBeGreaterThanOrEqual(expected.length - 1);
    for (const line of lines) {
      expect(line.ocrConfidence).toBeGreaterThan(0.5);
      expect(line.items.every((i) => i.source === "ocr")).toBe(true);
    }
  }, 60_000);

  it("runs OCR in the pipeline, flags the page and masks Vietnamese lines only", async () => {
    const bytes = await buildFixture("scanned-mixed");
    const { pages, masksByPage } = await processScanned(bytes);
    const page = pages.get(0)!;
    expect(page).toMatchObject({ state: "ready", noTextLayer: true, ocr: true });
    expect(page.timings!.ocrMs).toBeGreaterThan(0);

    const spec = getFixture("scanned-mixed").pages[0];
    for (const expected of spec.lines) {
      const mask = masksByPage[0].find((m) => squash(m.sourceText) === squash(expected.text));
      if (!mask) continue; // tolerated OCR miss (checked by the previous test)
      const tier = effectiveTier(mask, DEFAULT_THRESHOLDS);
      if (expected.vi) expect(tier, expected.text).toBe("auto");
      else expect(tier, expected.text).not.toBe("auto");
    }
    const autoCount = masksByPage[0].filter((m) => effectiveTier(m, DEFAULT_THRESHOLDS) === "auto").length;
    expect(autoCount).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it("skips OCR when disabled and on blank-image pages finds nothing", async () => {
    const bytes = await buildFixture("scanned-page");
    const { doc, pageCount } = await loadPdf(bytes);
    const updates = new Map<number, PageContentUpdate>();
    await startDocumentProcessing({
      pageCount,
      getPage: (i) => doc.getPage(i + 1),
      getCurrentPage: () => 0,
      onPageUpdate: (i, u) => updates.set(i, u),
      ocr: { enabled: () => false, recognize: async () => [] },
      yieldToUi: async () => undefined,
    }).done;
    await destroyPdf(doc);
    expect(updates.get(1)).toMatchObject({ state: "ready", noTextLayer: true, ocr: false });
    expect(updates.get(0)).toMatchObject({ noTextLayer: false });
  }, 60_000);

  it("SECURITY: redacted scanned text cannot be recovered by OCR, text extraction or pixels", async () => {
    const bytes = await buildFixture("scanned-mixed");
    const { masksByPage } = await processScanned(bytes);
    const plan = planRedaction(masksByPage, DEFAULT_THRESHOLDS);
    expect(plan.regions.length).toBeGreaterThanOrEqual(2);

    const { bytes: redacted } = redactPdf({ bytes, regions: plan.regions });
    const report = mergeReports(validateWithMupdf(redacted, plan.regions), await validateWithPdfjs(redacted, plan.regions));
    expect(report.ok, JSON.stringify(report.leaks)).toBe(true);

    // Re-OCR the exported page: the Vietnamese lines must be gone, English must remain readable.
    const after = squash((await recognizeWithMupdf(engine, redacted, 0)).map((l) => l.text).join(" "));
    for (const region of plan.regions) {
      expect(after).not.toContain(squash(region.sourceText));
    }
    expect(after).not.toContain(squash("Mục tiêu"));
    expect(after).not.toContain(squash("phụ trách"));
    expect(after).toContain(squash("Target luminance"));
  }, 90_000);
});
