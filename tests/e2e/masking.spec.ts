/// <reference types="node" />
import { expect, test, type Page } from "@playwright/test";
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

/**
 * Measures, on page 0, how much rendered ink of each line lies under solid masks.
 * Line boxes come from the debug overlay (tier = detection result); ink comes from the canvas.
 */
async function inkCoverage(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('.pdf-page[data-page-index="0"]')!;
    const canvas = root.querySelector("canvas") as HTMLCanvasElement;
    const ratio = canvas.width / root.getBoundingClientRect().width;
    const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    const rectOf = (el: Element) => ({
      x: Number(el.getAttribute("x")) * ratio,
      y: Number(el.getAttribute("y")) * ratio,
      w: Number(el.getAttribute("width")) * ratio,
      h: Number(el.getAttribute("height")) * ratio,
    });
    const masks = [...root.querySelectorAll(".mask-solid rect")].map(rectOf);
    const covered = (x: number, y: number) => masks.some((m) => x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h);

    return [...root.querySelectorAll(".debug-layer g[data-line-id]")].map((g) => {
      const box = rectOf(g.querySelector("rect")!);
      let ink = 0;
      let hidden = 0;
      for (let y = Math.floor(box.y); y < box.y + box.h; y++) {
        for (let x = Math.floor(box.x); x < box.x + box.w; x++) {
          const i = (y * canvas.width + x) * 4;
          if (data[i] + data[i + 1] + data[i + 2] >= 300) continue;
          ink++;
          if (covered(x, y)) hidden++;
        }
      }
      return { tier: g.getAttribute("class")!.replace("debug-tier-", ""), ink, hiddenFraction: ink ? hidden / ink : 0 };
    });
  });
}

async function expectCorrectMasking(page: Page) {
  await page.waitForTimeout(400); // debounced sharp re-render
  const lines = await inkCoverage(page);
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    expect(line.ink).toBeGreaterThan(20);
    if (line.tier === "auto") expect(line.hiddenFraction).toBeGreaterThan(0.99);
    else expect(line.hiddenFraction).toBeLessThan(0.01);
  }
}

test.describe("Vietnamese masking", () => {
  test("AC-01/02/03: masks cover Vietnamese lines and leave English visible", async ({ page }) => {
    await openFixture(page, "mixed-en-vi");
    await expect(page.locator(".mask-solid")).toHaveCount(2);
    await page.keyboard.press("ControlOrMeta+Shift+D"); // debug boxes provide per-line geometry
    await expectCorrectMasking(page);
  });

  test("AC-04/05: masks stay aligned across zoom and window resize", async ({ page }) => {
    await openFixture(page, "technical-mixed-language");
    await expect(page.locator(".mask-solid")).toHaveCount(4);
    await page.keyboard.press("ControlOrMeta+Shift+D");

    for (const key of ["ControlOrMeta+Equal", "ControlOrMeta+Equal", "ControlOrMeta+Minus", "ControlOrMeta+Minus", "ControlOrMeta+Minus"]) {
      await page.keyboard.press(key);
      await expectCorrectMasking(page);
    }
    for (const size of [
      { width: 1000, height: 700 },
      { width: 1400, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await page.getByRole("button", { name: "Fit width" }).click();
      await expectCorrectMasking(page);
    }
  });

  test("AC-06: toggling masks does not re-render the PDF canvas", async ({ page }) => {
    await openFixture(page, "mixed-en-vi");
    await expect(page.locator(".mask-solid")).toHaveCount(2);
    await page.locator('.pdf-page[data-page-index="0"] canvas').evaluate((c) => ((c as HTMLCanvasElement).dataset.marker = "same"));

    await page.getByRole("switch", { name: "Vietnamese masking" }).uncheck({ force: true });
    await expect(page.locator(".mask-solid")).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+Shift+M");
    await expect(page.locator(".mask-solid")).toHaveCount(2);
    await expect(page.locator('.pdf-page[data-page-index="0"] canvas[data-marker="same"]')).toHaveCount(1);
  });

  test("AC-07: ignore a region, undo it, show original and hide again", async ({ page }) => {
    await openFixture(page, "mixed-en-vi");
    await expect(page.locator(".mask-solid")).toHaveCount(2);

    await page.locator(".mask-solid").first().click();
    const inspector = page.getByRole("dialog", { name: "Mask inspector" });
    await expect(inspector).toContainText("Vietnamese text");
    await inspector.getByRole("button", { name: "Ignore this region" }).click();
    await expect(page.locator(".mask-solid")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^Page 1\b/ })).toHaveText(/1$/);

    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.locator(".mask-solid")).toHaveCount(2);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(page.locator(".mask-solid")).toHaveCount(1);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".mask-solid")).toHaveCount(2);

    await page.locator(".mask-solid").first().click();
    await inspector.getByRole("button", { name: "Show original" }).click();
    await expect(page.locator(".mask-revealed")).toHaveCount(1);
    await expect(page.locator(".mask-solid")).toHaveCount(1);

    await page.locator(".mask-revealed").click();
    await expect(inspector).toContainText("Mục tiêu của dự án");
    await inspector.getByRole("button", { name: "Hide again" }).click();
    await expect(page.locator(".mask-solid")).toHaveCount(2);

    await page.locator(".mask-solid").first().click();
    await page.keyboard.press("Escape");
    await expect(inspector).toHaveCount(0);
  });

  test("uncertain regions are outlined with confidence and can be confirmed", async ({ page }) => {
    await openFixture(page, {
      name: "names",
      pages: [
        {
          lines: [
            { text: "Approved by", x: 72, y: 720, vi: false },
            { text: "Nguyễn Văn A", x: 72, y: 690, vi: false },
          ],
        },
      ],
    });
    await expect(page.locator(".mask-uncertain")).toHaveCount(1);
    await expect(page.locator(".mask-uncertain .mask-percent")).toHaveText("70%");
    await expect(page.locator(".mask-solid")).toHaveCount(0);

    await page.locator(".mask-uncertain").click();
    const inspector = page.getByRole("dialog", { name: "Mask inspector" });
    await expect(inspector).toContainText("Possibly Vietnamese");
    await inspector.getByRole("button", { name: "Confirm Vietnamese" }).click();
    await expect(page.locator(".mask-solid")).toHaveCount(1);
    await expect(page.locator(".mask-solid")).toHaveAttribute("data-status", "confirmed");
  });

  test("keyboard: masks are focusable and open the inspector with Enter", async ({ page }) => {
    await openFixture(page, "mixed-en-vi");
    await expect(page.locator(".mask-solid")).toHaveCount(2);
    await page.locator(".mask-solid").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Mask inspector" })).toBeVisible();
  });
});
