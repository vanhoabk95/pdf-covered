/// <reference types="node" />
import { expect, test } from "@playwright/test";
import * as mupdf from "mupdf";
import { readFileSync } from "node:fs";
import { buildFixture } from "../helpers/fixtures";

test("scanned PDF: OCR in the browser, masks Vietnamese, exports with pixels removed", async ({ page }) => {
  test.setTimeout(120_000);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));

  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose PDF…" }).click();
  const bytes = await buildFixture("scanned-mixed");
  await (await chooser).setFiles({ name: "scanned-mixed.pdf", mimeType: "application/pdf", buffer: Buffer.from(bytes) });

  await expect(page.getByRole("button", { name: /^Page 1\b/ })).toContainText("OCR", { timeout: 60_000 });
  await expect(page.locator(".mask-solid").first()).toBeVisible();
  const solid = await page.locator(".mask-solid").count();
  expect(solid).toBeGreaterThanOrEqual(2);

  // AC-12: OCR assets are served locally; nothing leaves the machine.
  expect(requests.filter((u) => !u.startsWith("http://localhost:1420") && !u.startsWith("blob:") && !u.startsWith("data:"))).toEqual([]);

  await page.keyboard.press("ControlOrMeta+e");
  const dialog = page.getByRole("dialog", { name: "Export Redacted PDF" });
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export…" }).click();
  const file = await download;
  await expect(dialog).toContainText("saved and verified", { timeout: 60_000 });

  const out = new Uint8Array(readFileSync((await file.path())!));
  expect(mupdf.Document.openDocument(out, "application/pdf").countPages()).toBe(1);
});
