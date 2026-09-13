import * as mupdf from "mupdf";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { planRedaction } from "../src/export/plan";
import { redactPdf } from "../src/export/redactPdf";
import type { RedactionRegion } from "../src/export/types";
import { mergeReports, validateWithMupdf } from "../src/export/validateRedaction";
import { extractAllText, validateWithPdfjs } from "../src/export/validateWithPdfjs";
import { ExportError } from "../src/export/types";
import { buildFixture, FIXTURE_PASSWORD } from "./helpers/fixtures";
import { analyzeDocument } from "./helpers/pipeline";

/**
 * MANDATORY (spec §51): redacted Vietnamese text must not be recoverable by text extraction.
 * A visual black rectangle alone must fail these tests.
 */

const squash = (s: string) => s.normalize("NFC").replace(/\s+/g, "");

function mupdfText(bytes: Uint8Array): string {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const parts: string[] = [];
  for (let i = 0; i < doc.countPages(); i++) parts.push(doc.loadPage(i).toStructuredText("preserve-whitespace").asText());
  return parts.join("\n");
}

async function exportFixture(name: string, options: Parameters<typeof analyzeDocument>[1] = {}) {
  const input = await buildFixture(name);
  const analysis = await analyzeDocument(input, options);
  const plan = planRedaction(analysis.masksByPage, analysis.thresholds);
  const result = redactPdf({ bytes: input, regions: plan.regions });
  const report = mergeReports(validateWithMupdf(result.bytes, plan.regions), await validateWithPdfjs(result.bytes, plan.regions));
  const pdfjsText = squash((await extractAllText(result.bytes)).join(" "));
  const muText = squash(mupdfText(result.bytes));
  return { input, analysis, plan, result, report, pdfjsText, muText };
}

describe("redaction security (spec §51)", () => {
  it('"Mục tiêu dự án" → redact → export → extract: text is gone, English remains', async () => {
    const { plan, report, pdfjsText, muText, result } = await exportFixture("mixed-en-vi");

    expect(plan.regions).toHaveLength(2);
    expect(report.ok, JSON.stringify(report.leaks)).toBe(true);

    for (const text of [pdfjsText, muText]) {
      expect(text).not.toContain(squash("Mục tiêu"));
      expect(text).not.toContain(squash("Mục tiêu của dự án là cải thiện hệ thống."));
      expect(text).not.toContain(squash("Người phụ trách"));
      expect(text).not.toContain(squash("Nguyễn Văn A"));
      expect(text).toContain(squash("Project Overview"));
      expect(text).toContain(squash("Target luminance: 500 nit"));
    }
    expect(result.report.redactedRegions).toBe(2);
  });

  it.each(["technical-mixed-language", "multi-page", "rotated-page", "two-column", "vietnamese-only"])(
    "%s: every auto-detected Vietnamese line is unrecoverable; other lines survive",
    async (name) => {
      const { analysis, plan, report, pdfjsText, muText } = await exportFixture(name);
      expect(report.ok, JSON.stringify(report.leaks)).toBe(true);
      const redacted = new Set(plan.regions.map((r) => squash(r.sourceText)));
      for (const [, page] of analysis.pages) {
        for (const line of page.lines ?? []) {
          const t = squash(line.text);
          if (redacted.has(t)) {
            expect(pdfjsText).not.toContain(t);
            expect(muText).not.toContain(t);
          } else {
            expect(pdfjsText, `visible line "${line.text}" must survive`).toContain(t);
          }
        }
      }
    },
  );

  it("ignored and uncertain regions are not redacted; confirmed and manual regions are", async () => {
    const input = await buildFixture("technical-mixed-language");
    const first = await analyzeDocument(input);
    const masks = first.masksByPage[0];
    const panel = masks.find((m) => m.sourceText === "Panel bị lỗi mura")!;
    const name = masks.find((m) => m.sourceText === "Nguyen Van A")!;
    const gamma = masks.find((m) => m.sourceText === "Gamma 2.2, white point D65")!;

    const manual = { ...gamma, key: "manual:test", id: "manual:test", status: "manual" as const, detector: "manual", sourceText: "" };
    const { plan, result } = await (async () => {
      const analysis = await analyzeDocument(input, {
        overrides: { [panel.key]: "ignored", [name.key]: "confirmed" },
        manual: [manual],
      });
      const plan = planRedaction(analysis.masksByPage, analysis.thresholds);
      return { plan, result: redactPdf({ bytes: input, regions: plan.regions }) };
    })();

    const text = squash((await extractAllText(result.bytes)).join(" "));
    expect(text).toContain(squash("Panel bị lỗi mura")); // ignored → kept
    expect(text).not.toContain(squash("Nguyen Van A")); // confirmed → removed
    expect(text).not.toContain(squash("Gamma 2.2, white point D65")); // manual → removed
    expect(text).toContain(squash("LG Display Vietnam"));
    expect(plan.regions.some((r) => r.sourceText === "")).toBe(true);
  });

  it("the validator catches a fake redaction (black rectangle drawn over the text)", async () => {
    const input = await buildFixture("mixed-en-vi");
    const analysis = await analyzeDocument(input);
    const { regions } = planRedaction(analysis.masksByPage, analysis.thresholds);

    // Draw opaque rectangles on top without removing the text — the classic unsafe "redaction".
    const doc = await PDFDocument.load(input);
    const page = doc.getPage(0);
    for (const r of regions) page.drawRectangle({ x: r.bbox.x, y: r.bbox.y, width: r.bbox.width, height: r.bbox.height });
    const fake = await doc.save();

    const mu = validateWithMupdf(fake, regions);
    const pj = await validateWithPdfjs(fake, regions);
    expect(mu.ok).toBe(false);
    expect(mu.leaks.some((l) => l.engine === "mupdf-text")).toBe(true);
    expect(pj.ok).toBe(false);
    // The pixel check alone would pass — which is exactly why text extraction checks are required.
    expect(mu.leaks.every((l) => l.engine !== "pixels")).toBe(true);
  });

  it("the validator catches a region that was not blacked out", async () => {
    const input = await buildFixture("mixed-en-vi");
    const region: RedactionRegion = { pageIndex: 0, bbox: { x: 300, y: 300, width: 100, height: 40 }, sourceText: "" };
    const report = validateWithMupdf(input, [region]);
    expect(report.leaks.some((l) => l.engine === "pixels")).toBe(true);
  });

  it("strips metadata, bookmarks and annotations that could carry hidden text", async () => {
    const base = await PDFDocument.load(await buildFixture("mixed-en-vi"));
    base.setTitle("Báo cáo mục tiêu dự án");
    base.setSubject("Người phụ trách: Nguyễn Văn A");
    base.setKeywords(["kiểm tra", "bí mật"]);
    const withMetadata = await base.save();

    const analysis = await analyzeDocument(withMetadata);
    const { regions } = planRedaction(analysis.masksByPage, analysis.thresholds);
    const { bytes, report } = redactPdf({ bytes: withMetadata, regions });

    const doc = mupdf.Document.openDocument(bytes, "application/pdf");
    expect(doc.getMetaData("info:Title") ?? "").toBe("");
    expect(doc.getMetaData("info:Subject") ?? "").toBe("");
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getTitle()).toBeUndefined();
    expect(reloaded.getSubject()).toBeUndefined();
    expect(reloaded.getKeywords()).toBeUndefined();
    expect(report.removed.join(" ")).toMatch(/Document information/);
  });

  it("password-protected input: redacts with the session password; output opens without one", async () => {
    const input = await buildFixture("password-protected");
    const regions: RedactionRegion[] = [
      { pageIndex: 0, bbox: { x: 68, y: 678, width: 300, height: 20 }, sourceText: "Mục tiêu của dự án là cải thiện hệ thống." },
    ];
    expect(() => redactPdf({ bytes: input, regions })).toThrow(ExportError);

    const { bytes } = redactPdf({ bytes: input, password: FIXTURE_PASSWORD, regions });
    const reopened = mupdf.Document.openDocument(bytes, "application/pdf");
    expect(reopened.needsPassword()).toBe(false);
    const text = squash(mupdfText(bytes));
    expect(text).not.toContain(squash("Mục tiêu"));
    expect(text).toContain(squash("Target luminance"));
    expect(validateWithMupdf(bytes, regions).ok).toBe(true);
  });

  it("output is a full rewrite, not an incremental update", async () => {
    const { result, input } = await exportFixture("mixed-en-vi");
    const out = Buffer.from(result.bytes).toString("latin1");
    expect((out.match(/%%EOF/g) ?? []).length).toBe(1);
    expect(out.startsWith(Buffer.from(input.slice(0, 64)).toString("latin1"))).toBe(false);
  });
});
