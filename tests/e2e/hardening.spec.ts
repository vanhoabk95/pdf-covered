/// <reference types="node" />
import { expect, test, type Page } from "@playwright/test";
import * as mupdf from "mupdf";
import { readFileSync } from "node:fs";
import { buildFixture, FIXTURE_PASSWORD } from "../helpers/fixtures";

async function chooseFile(page: Page, name: string, bytes: Uint8Array) {
  const chooser = page.waitForEvent("filechooser");
  const openButton = page.getByRole("button", { name: "Choose PDF…" });
  if (await openButton.isVisible()) await openButton.click();
  else await page.getByRole("button", { name: "Open" }).click();
  await (await chooser).setFiles({ name, mimeType: "application/pdf", buffer: Buffer.from(bytes) });
}

test("password-protected PDF: wrong password, right password, mask, export", async ({ page }) => {
  await page.goto("/");
  await chooseFile(page, "secret.pdf", await buildFixture("password-protected"));

  const dialog = page.getByRole("dialog", { name: "Enter PDF Password" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").fill("wrong");
  await dialog.getByRole("button", { name: "Open" }).click();
  await expect(dialog).toContainText("incorrect");

  await dialog.locator("input").fill(FIXTURE_PASSWORD);
  await dialog.getByRole("button", { name: "Open" }).click();
  await expect(page.locator(".mask-solid")).toHaveCount(1);

  // The password is never persisted.
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storage).not.toContain(FIXTURE_PASSWORD);

  await page.keyboard.press("ControlOrMeta+e");
  const exportDialog = page.getByRole("dialog", { name: "Export Redacted PDF" });
  const download = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Export…" }).click();
  const file = await download;
  await expect(exportDialog).toContainText("saved and verified", { timeout: 30_000 });
  const out = mupdf.Document.openDocument(new Uint8Array(readFileSync((await file.path())!)), "application/pdf");
  expect(out.needsPassword()).toBe(false);
  expect(out.loadPage(0).toStructuredText("preserve-whitespace").asText()).not.toContain("Mục tiêu");
});

test("reopening the same file in a session restores decisions; another file starts clean", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/");
  const mixed = await buildFixture("mixed-en-vi");

  await chooseFile(page, "mixed.pdf", mixed);
  await expect(page.locator(".mask-solid")).toHaveCount(2);
  await page.locator(".mask-solid").first().click();
  await page.getByRole("dialog", { name: "Mask inspector" }).getByRole("button", { name: "Ignore this region" }).click();
  await expect(page.locator(".mask-solid")).toHaveCount(1);

  await chooseFile(page, "other.pdf", await buildFixture("technical-mixed-language"));
  await expect(page.locator(".mask-solid")).toHaveCount(4);
  await expect(page.getByTestId("count-ignored")).toHaveText("0");

  await chooseFile(page, "mixed-again.pdf", mixed);
  await expect(page.getByTestId("count-ignored")).toHaveText("1");
  await expect(page.locator(".mask-solid")).toHaveCount(1);

  // AC-12: no request ever leaves the local app origin.
  expect(requests.filter((u) => !/^(http:\/\/localhost:1420|blob:|data:)/.test(u))).toEqual([]);
});
