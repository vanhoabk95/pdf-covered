import { describe, expect, it } from "vitest";
import { groupLines } from "../src/grouping/lineGrouper";
import { destroyPdf, loadPdf } from "../src/pdf/pdfLoader";
import { extractPageText } from "../src/pdf/textExtractor";
import type { PdfTextItem } from "../src/pdf/types";
import { buildFixture, getFixture, listFixtures } from "./helpers/fixtures";

async function extractFixture(name: string) {
  const { doc, pageCount } = await loadPdf(await buildFixture(name));
  const pages: { items: PdfTextItem[]; lines: ReturnType<typeof groupLines> }[] = [];
  for (let i = 0; i < pageCount; i++) {
    const items = await extractPageText(await doc.getPage(i + 1), i);
    pages.push({ items, lines: groupLines(items) });
  }
  await destroyPdf(doc);
  return pages;
}

describe("text extraction + line grouping on fixtures", () => {
  it.each(listFixtures().filter((f) => !f.scanDpi).map((f) => f.name))("%s: grouped lines match the source lines", async (name) => {
    const fixture = getFixture(name);
    const pages = await extractFixture(name);
    fixture.pages.forEach((spec, pageIndex) => {
      const got = pages[pageIndex].lines.map((l) => l.text).sort();
      const expected = spec.lines.map((l) => l.text).sort();
      expect(got).toEqual(expected);
    });
  });

  it("round-trips Vietnamese diacritics exactly (NFC)", async () => {
    const [page] = await extractFixture("mixed-en-vi");
    const texts = page.lines.map((l) => l.text);
    expect(texts).toContain("Mục tiêu của dự án là cải thiện hệ thống.");
    expect(texts.every((t) => t === t.normalize("NFC"))).toBe(true);
  });

  it("orders lines top to bottom", async () => {
    const [page] = await extractFixture("mixed-en-vi");
    expect(page.lines.map((l) => l.text)).toEqual([
      "Project Overview",
      "Mục tiêu của dự án là cải thiện hệ thống.",
      "Target luminance: 500 nit",
      "Người phụ trách: Nguyễn Văn A",
    ]);
  });

  it("places line boxes at the drawn baseline", async () => {
    const [page] = await extractFixture("mixed-en-vi");
    const target = page.lines.find((l) => l.text.startsWith("Target luminance"))!;
    // Drawn at x=72, baseline y=660, 12pt.
    expect(target.bbox.x).toBeCloseTo(72, 0);
    expect(target.bbox.y).toBeLessThan(660);
    expect(target.bbox.y).toBeGreaterThan(660 - 12 * 0.5);
    expect(target.bbox.y + target.bbox.height).toBeGreaterThan(660 + 12 * 0.6);
    expect(target.bbox.y + target.bbox.height).toBeLessThan(660 + 12 * 1.3);
    expect(target.rotation).toBe(0);
    expect(target.fontSize).toBeCloseTo(12);
  });

  it("reassembles a line drawn word by word", async () => {
    // PDF.js may merge some word objects itself; item-level joining is unit-tested in lineGrouper.
    const [page] = await extractFixture("vietnamese-only");
    const line = page.lines.find((l) => l.text.startsWith("Kế hoạch"))!;
    expect(line.text).toBe("Kế hoạch thực hiện được trình bày dưới đây.");
  });

  it("keeps columns on the same baseline as separate lines", async () => {
    const [page] = await extractFixture("two-column");
    const row = page.lines.filter((l) => Math.abs(l.bbox.y - page.lines[2].bbox.y) < 2);
    expect(row.map((l) => l.text)).toEqual(["Brightness must exceed 500 nit.", "Độ sáng phải lớn hơn 500 nit."]);
  });

  it("handles rotated text runs", async () => {
    const pages = await extractFixture("rotated-page");
    const vertical = pages[1].lines.find((l) => l.text === "Nhãn dọc tiếng Việt")!;
    expect(vertical.rotation).toBeCloseTo(90);
    expect(vertical.bbox.height).toBeGreaterThan(vertical.bbox.width);
    const diagonal = pages[1].lines.find((l) => l.text === "Diagonal note")!;
    expect(diagonal.rotation).toBeCloseTo(45);
  });

  it("reports no text on image-only pages", async () => {
    const pages = await extractFixture("scanned-page");
    expect(pages[0].items.length).toBeGreaterThan(0);
    expect(pages[1].items).toHaveLength(0);
  });
});
