import { resolvePageMasks } from "../../src/masking/pageMasks";
import { DEFAULT_MASK_PADDING } from "../../src/masking/maskGenerator";
import { DEFAULT_THRESHOLDS, type DetectionThresholds } from "../../src/masking/thresholds";
import type { MaskOverride, MaskRegion } from "../../src/masking/types";
import { startDocumentProcessing, type PageContentUpdate } from "../../src/pipeline/documentProcessor";
import { destroyPdf, loadPdf, readPageGeometries } from "../../src/pdf/pdfLoader";
import { createInlineDetectionClient } from "../../src/workers/detectionClient";

/** Runs the app's full text pipeline in Node and returns resolved masks per page. */
export async function analyzeDocument(
  bytes: Uint8Array,
  options: {
    overrides?: Record<string, MaskOverride>;
    manual?: MaskRegion[];
    thresholds?: DetectionThresholds;
  } = {},
) {
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
    yieldToUi: async () => undefined,
  }).done;
  await destroyPdf(doc);

  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  const masksByPage = Array.from({ length: pageCount }, (_, pageIndex) => {
    const page = pages.get(pageIndex)!;
    return resolvePageMasks({
      pageIndex,
      content: { lines: page.lines ?? [], detections: page.detections ?? [] },
      geometry: geometries[pageIndex],
      overrides: options.overrides ?? {},
      manual: options.manual ?? [],
      revealed: {},
      padding: DEFAULT_MASK_PADDING,
      thresholds,
    });
  });
  return { pageCount, geometries, pages, masksByPage, thresholds };
}
