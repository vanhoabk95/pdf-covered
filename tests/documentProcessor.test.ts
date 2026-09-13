import { describe, expect, it } from "vitest";
import { startDocumentProcessing, type PageContentUpdate } from "../src/pipeline/documentProcessor";
import { destroyPdf, loadPdf } from "../src/pdf/pdfLoader";
import { buildFixture } from "./helpers/fixtures";

describe("startDocumentProcessing", () => {
  it("extracts and groups every page in priority order", async () => {
    const { doc, pageCount } = await loadPdf(await buildFixture("multi-page"));
    const updates: [number, PageContentUpdate][] = [];
    let current = 4;

    const handle = startDocumentProcessing({
      pageCount,
      getPage: (i) => doc.getPage(i + 1),
      getCurrentPage: () => current,
      onPageUpdate: (i, u) => {
        updates.push([i, u]);
        // The user scrolls to the last page after the first page finishes.
        if (u.state === "ready" && i === 4) current = 9;
      },
      yieldToUi: async () => undefined,
    });
    await handle.done;

    const readyOrder = updates.filter(([, u]) => u.state === "ready").map(([i]) => i);
    // 4 first; then the jump to page 9 wins: 9, its previous page 8, then 0.. in sequence.
    expect(readyOrder).toEqual([4, 9, 8, 0, 1, 2, 3, 5, 6, 7]);

    const page0 = updates.find(([i, u]) => i === 0 && u.state === "ready")![1];
    expect(page0.lines!.map((l) => l.text)).toEqual([
      "Section 1",
      "Nội dung của phần 1 được viết bằng tiếng Việt.",
      "Result 1: PASS",
    ]);
    expect(page0.noTextLayer).toBe(false);
    await destroyPdf(doc);
  });

  it("flags pages without a text layer and survives page errors", async () => {
    const { doc, pageCount } = await loadPdf(await buildFixture("scanned-page"));
    const final = new Map<number, PageContentUpdate>();
    const handle = startDocumentProcessing({
      pageCount: pageCount + 1, // one extra page that cannot be loaded
      getPage: (i) => doc.getPage(i + 1),
      getCurrentPage: () => 0,
      onPageUpdate: (i, u) => final.set(i, u),
      yieldToUi: async () => undefined,
    });
    await handle.done;

    expect(final.get(0)).toMatchObject({ state: "ready", noTextLayer: false });
    expect(final.get(1)).toMatchObject({ state: "ready", noTextLayer: true });
    expect(final.get(2)?.state).toBe("error");
    await destroyPdf(doc);
  });

  it("stops after cancel", async () => {
    const { doc, pageCount } = await loadPdf(await buildFixture("multi-page"));
    let handleRef: { cancel(): void } | null = null;
    const ready: number[] = [];
    const handle = startDocumentProcessing({
      pageCount,
      getPage: (i) => doc.getPage(i + 1),
      getCurrentPage: () => 0,
      onPageUpdate: (i, u) => {
        if (u.state !== "ready") return;
        ready.push(i);
        if (ready.length === 2) handleRef?.cancel();
      },
      yieldToUi: async () => undefined,
    });
    handleRef = handle;
    await handle.done;
    expect(ready).toEqual([0, 1]);
    await destroyPdf(doc);
  });
});
