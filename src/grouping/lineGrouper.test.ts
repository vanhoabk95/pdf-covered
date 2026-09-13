import { describe, expect, it } from "vitest";
import { groupLines } from "./lineGrouper";
import { makeItem } from "./testItems";

const texts = (items: Parameters<typeof groupLines>[0], opts?: Parameters<typeof groupLines>[1]) =>
  groupLines(items, opts).map((l) => l.text);

describe("groupLines", () => {
  it("returns nothing for no items", () => {
    expect(groupLines([])).toEqual([]);
  });

  it("joins fragmented words on one baseline with spaces", () => {
    // Words drawn separately with a normal word gap (~0.3em).
    const words = ["Mục", "tiêu", "dự", "án"];
    let x = 72;
    const items = words.map((w) => {
      const item = makeItem({ text: w, x, y: 700, size: 10 });
      x += item.advance + 3;
      return item;
    });
    const lines = groupLines(items.reverse());
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Mục tiêu dự án");
    expect(lines[0].itemIds).toHaveLength(4);
    expect(lines[0].items.map((i) => i.text)).toEqual(words);
  });

  it("does not insert spaces between touching glyph runs", () => {
    const a = makeItem({ text: "Ki", x: 100, y: 500, advance: 10 });
    const b = makeItem({ text: "ểm", x: 110.2, y: 500, advance: 12 });
    expect(texts([a, b])).toEqual(["Kiểm"]);
  });

  it("keeps an existing trailing space instead of doubling it", () => {
    const a = makeItem({ text: "Target ", x: 72, y: 500, advance: 38 });
    const b = makeItem({ text: "luminance", x: 113, y: 500 });
    expect(texts([a, b])).toEqual(["Target luminance"]);
  });

  it("separates lines on different baselines and orders top to bottom", () => {
    const items = [
      makeItem({ text: "third", x: 72, y: 660 }),
      makeItem({ text: "first", x: 72, y: 700 }),
      makeItem({ text: "second", x: 72, y: 686 }),
    ];
    expect(texts(items)).toEqual(["first", "second", "third"]);
  });

  it("splits columns separated by a wide gap", () => {
    const items = [
      makeItem({ text: "Brightness", x: 72, y: 600 }),
      makeItem({ text: "Độ sáng", x: 320, y: 600 }),
    ];
    expect(texts(items)).toEqual(["Brightness", "Độ sáng"]);
  });

  it("gap threshold is configurable", () => {
    const items = [
      makeItem({ text: "Label", x: 72, y: 600, advance: 25 }),
      makeItem({ text: "value", x: 117, y: 600 }),
    ];
    expect(texts(items)).toEqual(["Label", "value"]); // 20pt gap = 2em
    expect(texts(items, { maxGapEm: 3 })).toEqual(["Label value"]);
  });

  it("splits a row when font sizes differ strongly", () => {
    const items = [
      makeItem({ text: "Heading", x: 72, y: 600, size: 24, advance: 80 }),
      makeItem({ text: "small note text", x: 160, y: 604, size: 10 }),
    ];
    expect(groupLines(items)).toHaveLength(2);
  });

  it("keeps short superscripts on the line", () => {
    const items = [
      makeItem({ text: "Area 5 m", x: 72, y: 600, size: 12, advance: 48 }),
      makeItem({ text: "2", x: 120.5, y: 605, size: 7, advance: 4 }),
    ];
    const lines = groupLines(items);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Area 5 m2");
  });

  it("drops duplicated overprint runs (fake bold)", () => {
    const items = [
      makeItem({ text: "Warning", x: 72, y: 600, advance: 40 }),
      makeItem({ text: "Warning", x: 72.3, y: 600, advance: 40 }),
    ];
    const lines = groupLines(items);
    expect(lines[0].text).toBe("Warning");
    expect(lines[0].items).toHaveLength(1);
  });

  it("does not merge lines with tight leading", () => {
    const items = [
      makeItem({ text: "line one", x: 72, y: 600, size: 10 }),
      makeItem({ text: "line two", x: 72, y: 590, size: 10 }),
    ];
    expect(texts(items)).toEqual(["line one", "line two"]);
  });

  it("groups rotated text along its own direction", () => {
    // Vertical text reading bottom-to-top (rotation 90): words stacked along +y.
    const a = makeItem({ text: "Nhãn", x: 100, y: 200, rotation: 90, advance: 25 });
    const b = makeItem({ text: "dọc", x: 100, y: 228, rotation: 90, advance: 18 });
    const other = makeItem({ text: "Unrelated", x: 140, y: 205, rotation: 0 });
    const lines = groupLines([other, b, a]);
    const vertical = lines.find((l) => l.rotation === 90)!;
    expect(vertical.text).toBe("Nhãn dọc");
    expect(vertical.bbox.height).toBeGreaterThan(vertical.bbox.width);
    expect(lines.find((l) => l.rotation === 0)!.text).toBe("Unrelated");
  });

  it("never mixes directions beyond the angle tolerance", () => {
    const a = makeItem({ text: "flat", x: 100, y: 100 });
    const b = makeItem({ text: "tilted", x: 125, y: 100, rotation: 10 });
    expect(groupLines([a, b])).toHaveLength(2);
  });

  it("computes union bbox, median font size and stable ids", () => {
    const items = [
      makeItem({ text: "A", x: 10, y: 100, size: 10, advance: 5 }),
      makeItem({ text: "B", x: 16, y: 100, size: 12, advance: 6 }),
      makeItem({ text: "C", x: 23, y: 100, size: 10, advance: 5 }),
    ];
    const [line] = groupLines(items);
    expect(line.id).toBe("p0-l0");
    expect(line.bbox.x).toBeCloseTo(10);
    expect(line.bbox.x + line.bbox.width).toBeCloseTo(28);
    expect(line.fontSize).toBe(10);
    expect(groupLines(items)).toEqual(groupLines([...items].reverse()));
  });
});
