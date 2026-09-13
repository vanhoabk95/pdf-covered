/// <reference types="node" />
import { expect, test, type Page } from "@playwright/test";
import { buildFixture } from "../helpers/fixtures";

async function openFixture(page: Page, name: string) {
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose PDF…" }).click();
  const bytes = await buildFixture(name);
  await (await chooser).setFiles({ name: `${name}.pdf`, mimeType: "application/pdf", buffer: Buffer.from(bytes) });
}

test("detection runs in a Web Worker and flags Vietnamese lines", async ({ page }) => {
  const workers: string[] = [];
  page.on("worker", (w) => workers.push(w.url()));
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await openFixture(page, "technical-mixed-language");
  await page.keyboard.press("ControlOrMeta+Shift+D");
  const panel = page.getByRole("region", { name: "Debug" });
  await expect(panel).toContainText("ready");

  // 4 technical Vietnamese lines auto; names / English stay below the auto threshold.
  await expect(page.locator(".debug-tier-auto")).toHaveCount(4);
  await expect(page.locator(".debug-tier-uncertain")).toHaveCount(0);
  await expect(page.locator(".debug-tier-none")).toHaveCount(6);
  await expect(page.locator(".debug-tier-auto .debug-label").first()).toHaveText(/^VI 0\.\d\d$|^VI 1\.00$/);

  expect(workers.some((url) => url.includes("detection.worker"))).toBe(true);
  expect(errors.filter((e) => /worker/i.test(e))).toEqual([]);
});

test("sidebar shows per-page detection counts", async ({ page }) => {
  await openFixture(page, "multi-page");
  // Pages 1, 2, 4… have one Vietnamese line; every third page is English only.
  await expect(page.getByRole("button", { name: /^Page 1\b/ })).toContainText("1");
  await expect(page.getByRole("button", { name: /^Page 3\b/ })).toContainText("0", { timeout: 10_000 });
  await expect(page.locator(".sidebar-meta")).not.toContainText("analyzing", { timeout: 10_000 });
});
