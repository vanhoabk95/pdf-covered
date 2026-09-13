/// <reference types="node" />
import { expect, test, type Page } from "@playwright/test";
import { buildFixture } from "../helpers/fixtures";

async function openFixture(page: Page, name: string) {
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose PDF…" }).click();
  const bytes = await buildFixture(name);
  await (await chooser).setFiles({ name: `${name}.pdf`, mimeType: "application/pdf", buffer: Buffer.from(bytes) });
  await expect(page.locator('.pdf-page[data-page-index="0"] canvas')).toBeVisible();
}

/**
 * For every grouped line box on a page, measures how much of the dark "ink" rendered on the
 * canvas around that line actually falls inside the box. Misaligned coordinates show up as
 * ink outside the boxes.
 */
async function inkInsideLineBoxes(page: Page, pageIndex: number) {
  return page.evaluate((index) => {
    const root = document.querySelector(`.pdf-page[data-page-index="${index}"]`)!;
    const canvas = root.querySelector("canvas") as HTMLCanvasElement;
    const pageRect = root.getBoundingClientRect();
    const ratio = canvas.width / pageRect.width;
    const ctx = canvas.getContext("2d")!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const dark = (x: number, y: number) => {
      const i = (y * canvas.width + x) * 4;
      return data[i] + data[i + 1] + data[i + 2] < 300;
    };

    const boxes = [...root.querySelectorAll(".debug-line")].map((r) => ({
      x: Number(r.getAttribute("x")) * ratio,
      y: Number(r.getAttribute("y")) * ratio,
      w: Number(r.getAttribute("width")) * ratio,
      h: Number(r.getAttribute("height")) * ratio,
    }));
    const inside = (x: number, y: number) => boxes.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);

    let total = 0;
    let within = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (!dark(x, y)) continue;
        total++;
        if (inside(x, y)) within++;
      }
    }
    return { boxes: boxes.length, total, fraction: total ? within / total : 0 };
  }, pageIndex);
}

async function waitForSharpRender(page: Page) {
  // Re-render after zoom is debounced; wait for it to settle.
  await page.waitForTimeout(400);
}

test.describe("text extraction alignment", () => {
  test("line boxes cover rendered text at several zoom levels", async ({ page }) => {
    await openFixture(page, "technical-mixed-language");
    await page.keyboard.press("ControlOrMeta+Shift+D");
    await expect(page.locator(".debug-line")).toHaveCount(10);

    for (const step of ["none", "ControlOrMeta+Equal", "ControlOrMeta+Equal", "ControlOrMeta+Minus"]) {
      if (step !== "none") await page.keyboard.press(step);
      await waitForSharpRender(page);
      const { boxes, total, fraction } = await inkInsideLineBoxes(page, 0);
      expect(boxes).toBe(10);
      expect(total).toBeGreaterThan(1000);
      expect(fraction).toBeGreaterThan(0.99);
    }
  });

  test("line boxes cover text on a /Rotate 90 page and on rotated text", async ({ page }) => {
    await openFixture(page, "rotated-page");
    await page.keyboard.press("ControlOrMeta+Shift+D");
    await expect(page.locator('.pdf-page[data-page-index="0"] .debug-line')).toHaveCount(2);
    await waitForSharpRender(page);
    expect((await inkInsideLineBoxes(page, 0)).fraction).toBeGreaterThan(0.99);

    await page.getByRole("button", { name: /^Page 2\b/ }).click();
    await expect(page.locator('.pdf-page[data-page-index="1"] .debug-line')).toHaveCount(3);
    await waitForSharpRender(page);
    expect((await inkInsideLineBoxes(page, 1)).fraction).toBeGreaterThan(0.99);
  });

  test("sidebar marks scanned pages: OCR'd by default, 'No text' when OCR is off", async ({ page }) => {
    await openFixture(page, "scanned-page");
    await expect(page.getByRole("button", { name: /^Page 2\b/ })).toContainText("OCR", { timeout: 30_000 });
    await expect(page.getByRole("button", { name: /^Page 1\b/ })).not.toContainText("OCR");

    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("OCR scanned pages (pages without a text layer)").uncheck();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("button", { name: /^Page 2\b/ })).toContainText("No text");
    await expect(page.locator(".sidebar-warning")).toContainText("no text layer");
    await page.evaluate(() => localStorage.clear());
  });

  test("debug panel reports page statistics", async ({ page }) => {
    await openFixture(page, "mixed-en-vi");
    await page.keyboard.press("ControlOrMeta+Shift+D");
    const panel = page.getByRole("region", { name: "Debug" });
    await expect(panel).toContainText("ready");
    await expect(panel.locator("dd").nth(3)).toHaveText("4");
    await panel.getByLabel("Grouped line boxes").uncheck();
    await expect(page.locator(".debug-line")).toHaveCount(0);
  });
});
