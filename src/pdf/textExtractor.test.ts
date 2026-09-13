import type { TextContent } from "pdfjs-dist/types/src/display/api";
import { describe, expect, it } from "vitest";
import { cleanText, normalizeDegrees, textItemsFromContent } from "./textExtractor";

function content(items: TextContent["items"], vertical = false): TextContent {
  return { items, styles: { f1: { ascent: 0.9, descent: -0.25, vertical, fontFamily: "sans-serif" } }, lang: null };
}

const run = (str: string, transform: number[], width: number, extra: Partial<{ height: number }> = {}) => ({
  str,
  dir: "ltr",
  transform,
  width,
  height: extra.height ?? 10,
  fontName: "f1",
  hasEOL: false,
});

describe("textItemsFromContent", () => {
  it("computes the box from baseline, font ascent/descent and advance", () => {
    const [item] = textItemsFromContent(content([run("Hello", [10, 0, 0, 10, 72, 700], 25)]), 2);
    expect(item.id).toBe("p2-i0");
    expect(item.pageIndex).toBe(2);
    expect(item.fontSize).toBe(10);
    expect(item.rotation).toBe(0);
    expect(item.x).toBeCloseTo(72);
    expect(item.width).toBeCloseTo(25);
    expect(item.y).toBeCloseTo(700 - 2.5);
    expect(item.height).toBeCloseTo(9 + 2.5);
    expect(item.ascent).toBeCloseTo(9);
    expect(item.descent).toBeCloseTo(2.5);
  });

  it("handles rotated runs", () => {
    // 90° counter-clockwise: text runs up the page.
    const [item] = textItemsFromContent(content([run("Up", [0, 10, -10, 0, 100, 100], 20)]), 0);
    expect(item.rotation).toBeCloseTo(90);
    expect(item.height).toBeCloseTo(20);
    expect(item.width).toBeCloseTo(11.5);
    expect(item.x).toBeCloseTo(100 - 9);
    expect(item.y).toBeCloseTo(100);
  });

  it("handles vertical writing mode", () => {
    const [item] = textItemsFromContent(content([run("縦書き", [10, 0, 0, 10, 300, 500], 10, { height: 30 })], true), 0);
    expect(item.dir).toBe("ttb");
    expect(item.height).toBeCloseTo(30);
    expect(item.y).toBeCloseTo(470);
  });

  it("skips marked content and blank runs, keeps item indices", () => {
    const items = textItemsFromContent(
      content([
        { type: "beginMarkedContent", id: "" },
        run("   ", [10, 0, 0, 10, 0, 0], 5),
        run("Kept", [10, 0, 0, 10, 0, 0], 20),
      ]),
      0,
    );
    expect(items).toHaveLength(1);
    expect(items[0].itemIndex).toBe(2);
  });

  it("skips degenerate transforms", () => {
    expect(textItemsFromContent(content([run("x", [0, 0, 0, 0, 0, 0], 5)]), 0)).toHaveLength(0);
  });
});

describe("cleanText", () => {
  it("composes combining marks to NFC", () => {
    expect(cleanText("Mu\u0323c ti\u00EAu")).toBe("M\u1EE5c ti\u00EAu");
  });

  it("strips control characters from broken ToUnicode maps", () => {
    expect(cleanText("Mụ\u0003c\u0000")).toBe("Mục");
    expect(cleanText("a\tb")).toBe("a\tb");
  });
});

describe("normalizeDegrees", () => {
  it.each([
    [0, 0],
    [360, 0],
    [270, -90],
    [-270, 90],
    [180, 180],
    [-180, 180],
  ])("%i → %i", (input, expected) => {
    expect(normalizeDegrees(input)).toBe(expected);
  });
});
