import { describe, expect, it } from "vitest";
import { buildFixture, type Fixture } from "./helpers/fixtures";
import { analyzeDocument } from "./helpers/pipeline";

/** Spec §24: ordinary business PDFs up to 100 pages, < 3 s initial processing per page. */
describe("performance", () => {
  it("processes a 100-page text document well within the per-page budget", async () => {
    const lines = (p: number) =>
      Array.from({ length: 30 }, (_, i) => ({
        text:
          i % 3 === 0
            ? `Mục ${p}.${i}: kiểm tra độ sáng của màn hình trước khi bàn giao cho khách hàng.`
            : `Item ${p}.${i}: measured luminance ${400 + i} nit, uniformity within tolerance.`,
        x: 72,
        y: 740 - i * 22,
        size: 10,
        vi: i % 3 === 0,
      }));
    const fixture: Fixture = { name: "hundred-pages", pages: Array.from({ length: 100 }, (_, p) => ({ lines: lines(p) })) };
    const bytes = await buildFixture(fixture);

    const start = performance.now();
    const { masksByPage, thresholds } = await analyzeDocument(bytes);
    const ms = performance.now() - start;

    const perPage = ms / 100;
    expect(perPage, `${perPage.toFixed(1)} ms/page`).toBeLessThan(300);
    const masked = masksByPage.flat().filter((m) => m.confidence >= thresholds.auto).length;
    expect(masked).toBe(100 * 10);
  }, 120_000);
});
