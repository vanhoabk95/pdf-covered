/// <reference types="node" />
import { expect, test, type Page } from "@playwright/test";
import * as mupdf from "mupdf";
import { readFileSync } from "node:fs";
import { buildFixture, type Fixture } from "../helpers/fixtures";

async function openFixture(page: Page, fixture: string | Fixture) {
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose PDF…" }).click();
  const bytes = await buildFixture(fixture);
  const name = typeof fixture === "string" ? fixture : fixture.name;
  await (await chooser).setFiles({ name: `${name}.pdf`, mimeType: "application/pdf", buffer: Buffer.from(bytes) });
  await expect(page.locator('.pdf-page[data-page-index="0"] canvas')).toBeVisible();
}

const squash = (s: string) => s.normalize("NFC").replace(/\s+/g, "");

test.describe("Export Redacted PDF", () => {
  test("AC-10/11: exported file has Vietnamese text removed and verified", async ({ page }) => {
    await openFixture(page, "mixed-en-vi");
    await expect(page.locator(".mask-solid")).toHaveCount(2);

    await page.keyboard.press("ControlOrMeta+e");
    const dialog = page.getByRole("dialog", { name: "Export Redacted PDF" });
    await expect(dialog).toContainText("temporary visual mask");
    await expect(dialog.getByTestId("export-regions")).toHaveText("2");

    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Export…" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("mixed-en-vi-redacted.pdf");
    await expect(dialog).toContainText("saved and verified", { timeout: 30_000 });
    await expect(dialog.getByTestId("export-verified")).toHaveText("2 regions, 0 leaks");

    // Independent check of the downloaded file in Node (PDF.js already verified it in the app;
    // the full two-engine check also runs in tests/redaction.security.test.ts).
    const bytes = new Uint8Array(readFileSync((await file.path())!));
    const doc = mupdf.Document.openDocument(bytes, "application/pdf");
    const text = squash(doc.loadPage(0).toStructuredText("preserve-whitespace").asText());
    expect(text).not.toContain(squash("Mục tiêu"));
    expect(text).not.toContain(squash("Người phụ trách"));
    expect(text).toContain(squash("Target luminance: 500 nit"));
  });

  test("uncertain regions are excluded unless confirmed", async ({ page }) => {
    await openFixture(page, {
      name: "names",
      pages: [
        {
          lines: [
            { text: "Mục tiêu của dự án là cải thiện hệ thống.", x: 72, y: 720, vi: true },
            { text: "Nguyễn Văn A", x: 72, y: 690, vi: false },
          ],
        },
      ],
    });
    await expect(page.locator(".mask-uncertain")).toHaveCount(1);
    await page.getByRole("button", { name: "Export Redacted PDF" }).click();
    const dialog = page.getByRole("dialog", { name: "Export Redacted PDF" });
    await expect(dialog.getByTestId("export-regions")).toHaveText("1");
    await expect(dialog.getByTestId("export-excluded")).toHaveText("1");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await page.locator(".mask-uncertain").click();
    await page.getByRole("dialog", { name: "Mask inspector" }).getByRole("button", { name: "Confirm Vietnamese" }).click();
    await page.getByRole("button", { name: "Export Redacted PDF" }).click();
    await expect(dialog.getByTestId("export-regions")).toHaveText("2");
  });
});
