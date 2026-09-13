import { describe, expect, it } from "vitest";
import { classifyConfidence } from "../src/masking/thresholds";
import { startDocumentProcessing, type PageContentUpdate } from "../src/pipeline/documentProcessor";
import { destroyPdf, loadPdf } from "../src/pdf/pdfLoader";
import { createInlineDetectionClient } from "../src/workers/detectionClient";
import { buildFixture, listFixtures } from "./helpers/fixtures";

async function processFixture(name: string) {
  const { doc, pageCount } = await loadPdf(await buildFixture(name));
  const client = createInlineDetectionClient();
  const pages = new Map<number, PageContentUpdate>();
  const handle = startDocumentProcessing({
    pageCount,
    getPage: (i) => doc.getPage(i + 1),
    getCurrentPage: () => 0,
    onPageUpdate: (i, u) => pages.set(i, u),
    detectLines: (lines) => client.detect(lines),
    yieldToUi: async () => undefined,
  });
  await handle.done;
  await destroyPdf(doc);
  return pages;
}

describe("detection pipeline on fixtures (ground truth per line)", () => {
  it.each(listFixtures().filter((f) => !f.scanDpi && !f.password).map((f) => [f.name, f] as const))("%s", async (_name, fixture) => {
    const pages = await processFixture(fixture.name);
    fixture.pages.forEach((spec, pageIndex) => {
      const page = pages.get(pageIndex)!;
      expect(page.state).toBe("ready");
      for (const expected of spec.lines) {
        const line = page.lines!.find((l) => l.text === expected.text);
        expect(line, `line "${expected.text}" extracted`).toBeDefined();
        const detection = page.detections!.find((d) => d.lineId === line!.id)!;
        const tier = classifyConfidence(detection.confidence);
        if (expected.vi) {
          expect(tier, `"${expected.text}" (${detection.confidence}) should be masked`).toBe("auto");
        } else {
          expect(tier, `"${expected.text}" (${detection.confidence}) must stay visible`).not.toBe("auto");
        }
      }
    });
  });

  it("spec §2 page: masks exactly the two Vietnamese lines", async () => {
    const pages = await processFixture("mixed-en-vi");
    const page = pages.get(0)!;
    const masked = page.lines!.filter((l) => {
      const d = page.detections!.find((x) => x.lineId === l.id)!;
      return classifyConfidence(d.confidence) === "auto";
    });
    expect(masked.map((l) => l.text)).toEqual([
      "Mục tiêu của dự án là cải thiện hệ thống.",
      "Người phụ trách: Nguyễn Văn A",
    ]);
    expect(page.timings!.detectMs).toBeGreaterThanOrEqual(0);
  });

  it("English-only document produces no auto or uncertain detections", async () => {
    const page = (await processFixture("english-only")).get(0)!;
    expect(page.detections!.every((d) => classifyConfidence(d.confidence) === "none")).toBe(true);
  });
});
