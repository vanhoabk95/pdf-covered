/// <reference types="node" />
import { expect, test, type Page } from "@playwright/test";
import { buildFixture, type Fixture } from "../helpers/fixtures";

async function openFixture(page: Page, fixture: string | Fixture, { goto = true } = {}) {
  if (goto) await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose PDF…" }).click();
  const bytes = await buildFixture(fixture);
  const name = typeof fixture === "string" ? fixture : fixture.name;
  await (await chooser).setFiles({ name: `${name}.pdf`, mimeType: "application/pdf", buffer: Buffer.from(bytes) });
  await expect(page.locator('.pdf-page[data-page-index="0"] canvas')).toBeVisible();
}

const count = (page: Page, id: string) => page.getByTestId(`count-${id}`);

/** A page with one strong Vietnamese line and one borderline (0.70) name line. */
const borderline: Fixture = {
  name: "borderline",
  pages: [
    {
      lines: [
        { text: "Mục tiêu của dự án là cải thiện hệ thống.", x: 72, y: 720, vi: true },
        { text: "Nguyễn Văn A", x: 72, y: 690, vi: false },
        { text: "Target luminance: 500 nit", x: 72, y: 660, vi: false },
      ],
    },
  ],
};

test.describe("Phase E controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  test("AC-08: changing sensitivity updates visible detections", async ({ page }) => {
    await openFixture(page, borderline, { goto: false });
    await expect(count(page, "vietnamese")).toHaveText("1");
    await expect(count(page, "uncertain")).toHaveText("1");
    await expect(page.locator(".mask-solid")).toHaveCount(1);

    await page.getByRole("combobox", { name: "Sensitivity" }).selectOption("high"); // auto ≥ 0.65
    await expect(count(page, "vietnamese")).toHaveText("2");
    await expect(page.locator(".mask-solid")).toHaveCount(2);

    await page.getByRole("combobox", { name: "Sensitivity" }).selectOption("strict");
    await expect(count(page, "vietnamese")).toHaveText("1");
    await expect(page.locator(".mask-solid")).toHaveCount(1);

    await page.getByRole("checkbox", { name: "Uncertain" }).uncheck();
    await expect(page.locator(".mask-uncertain")).toHaveCount(0);
  });

  test("results list navigates to a region, flashes it, and restores ignored regions", async ({ page }) => {
    await openFixture(page, "multi-page", { goto: false });
    await page.getByRole("tab", { name: "Results" }).click();
    const results = page.getByRole("list", { name: "Detection results" });
    await expect(results.getByText("Page 8", { exact: true })).toBeVisible({ timeout: 15_000 });

    await results.getByRole("button", { name: /Nội dung của phần 8/ }).click();
    await expect(page.locator(".page-input input")).toHaveValue("8");
    await expect(page.locator('.pdf-page[data-page-index="7"] .mask-flash')).toHaveCount(1);

    // Ignore it from the inspector, then restore it from the results list.
    await page.locator('.pdf-page[data-page-index="7"] .mask-solid').click();
    await page.getByRole("dialog", { name: "Mask inspector" }).getByRole("button", { name: "Ignore this region" }).click();
    await expect(count(page, "ignored")).toHaveText("1");
    await results.getByRole("button", { name: "Restore" }).click();
    await expect(count(page, "ignored")).toHaveText("0");
    await expect(page.locator('.pdf-page[data-page-index="7"] .mask-solid')).toHaveCount(1);
  });

  test("manual mask tool draws a mask that survives zoom and can be undone", async ({ page }) => {
    await openFixture(page, "english-only", { goto: false });
    await expect(page.locator(".mask-solid")).toHaveCount(0);

    await page.getByRole("button", { name: "Manual mask tool" }).click();
    const layer = page.locator('.manual-mask-layer[data-page-index="0"]');
    const box = (await layer.boundingBox())!;
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 160, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator(".mask-solid")).toHaveCount(1);
    await expect(page.locator(".mask-solid")).toHaveAttribute("data-status", "manual");
    await expect(count(page, "manual")).toHaveText("1");

    const zoomOf = async () => Number((await page.locator(".zoom-value").textContent())!.replace("%", ""));
    const before = (await page.locator(".mask-solid rect").boundingBox())!;
    expect(before.width).toBeCloseTo(200, 0);
    const zoomBefore = await zoomOf();
    await page.keyboard.press("Escape");
    await page.keyboard.press("ControlOrMeta+Equal");
    const zoomAfter = await zoomOf();
    const after = (await page.locator(".mask-solid rect").boundingBox())!;
    // The mask scales with the page: width ratio matches the zoom ratio (±2% for % rounding).
    expect(Math.abs(after.width / before.width - zoomAfter / zoomBefore)).toBeLessThan(0.02);

    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.locator(".mask-solid")).toHaveCount(0);
  });

  test("settings persist locally and auto-detect can be turned off", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await dialog.getByLabel("Automatically start detection when a PDF opens").uncheck();
    await dialog.getByLabel("Detection threshold").fill("0.9");
    await dialog.getByRole("button", { name: "Done" }).click();

    await page.reload();
    await openFixture(page, "mixed-en-vi", { goto: false });
    await expect(page.locator(".mask-solid")).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Sensitivity" })).toHaveValue("custom");
    await page.getByRole("button", { name: "Detect Vietnamese" }).click();
    await expect(page.locator(".mask-solid")).toHaveCount(2);

    const stored = await page.evaluate(() => localStorage.getItem("vimask.settings"));
    expect(stored).not.toContain("Mục");
  });
});
