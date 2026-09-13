/// <reference types="node" />
import { expect, test, type Page } from "@playwright/test";
import { makePdf } from "../helpers/makePdf";

async function openPdf(page: Page, name: string, bytes: Uint8Array) {
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose PDF…" }).click();
  await (await chooser).setFiles({ name, mimeType: "application/pdf", buffer: Buffer.from(bytes) });
}

async function pageBox(page: Page, index: number) {
  return page.locator(`.pdf-page[data-page-index="${index}"]`).boundingBox();
}

test("opens a multi-page PDF and renders pages", async ({ page }) => {
  const bytes = await makePdf(
    Array.from({ length: 6 }, (_, i) => ({
      rotate: (i === 3 ? 90 : 0) as 0 | 90,
      lines: [{ text: `Project Overview ${i + 1}`, x: 72, y: 720, size: 20 }],
    })),
  );
  await openPdf(page, "sample.pdf", bytes);

  await expect(page.locator(".sidebar-filename")).toHaveText("sample.pdf");
  await expect(page.locator(".page-input span")).toHaveText("/ 6");
  await expect(page.locator('.pdf-page[data-page-index="0"] canvas')).toBeVisible();

  // Virtualization: far pages are not mounted.
  await expect(page.locator('.pdf-page[data-page-index="5"]')).toHaveCount(0);

  // Navigate to the rotated page: it is laid out landscape.
  await page.getByRole("button", { name: /^Page 4\b/ }).click();
  await expect(page.locator('.pdf-page[data-page-index="3"] canvas')).toBeVisible();
  const rotated = await pageBox(page, 3);
  expect(rotated!.width).toBeGreaterThan(rotated!.height);
  await expect(page.locator(".page-input input")).toHaveValue("4");
});

test("mask layer tracks page size across zoom and window resize", async ({ page }) => {
  await openPdf(page, "zoom.pdf", await makePdf([{}, {}]));
  await expect(page.locator('.pdf-page[data-page-index="0"] canvas')).toBeVisible();

  await page.getByRole("button", { name: "Fit page" }).click();
  await page.keyboard.press("ControlOrMeta+Equal");
  await page.keyboard.press("ControlOrMeta+Equal");
  const before = await pageBox(page, 0);
  const zoomText = await page.locator(".zoom-value").textContent();
  await page.keyboard.press("ControlOrMeta+Minus");
  const after = await pageBox(page, 0);
  expect(await page.locator(".zoom-value").textContent()).not.toBe(zoomText);
  expect(after!.width).toBeLessThan(before!.width);

  for (const size of [
    { width: 1280, height: 840 },
    { width: 900, height: 600 },
  ]) {
    await page.setViewportSize(size);
    await page.getByRole("button", { name: "Fit width" }).click();
    await page.waitForTimeout(200);
    const pageRect = await pageBox(page, 0);
    const maskRect = await page.locator('.mask-layer[data-page-index="0"]').boundingBox();
    expect(Math.abs(maskRect!.width - pageRect!.width)).toBeLessThan(1);
    expect(Math.abs(maskRect!.height - pageRect!.height)).toBeLessThan(1);
    expect(Math.abs(maskRect!.x - pageRect!.x)).toBeLessThan(1);
  }
});

test("shows an error for a corrupt PDF", async ({ page }) => {
  await openPdf(page, "broken.pdf", new TextEncoder().encode("%PDF-1.7 garbage"));
  await expect(page.getByRole("alertdialog")).toContainText("not a valid PDF");
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.getByRole("button", { name: "Choose PDF…" })).toBeVisible();
});
