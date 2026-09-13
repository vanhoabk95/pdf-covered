import { describe, expect, it } from "vitest";
import { resolveShortcut, type KeyInput } from "./shortcuts";

const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  inTextField: false,
  ...mods,
});

describe("resolveShortcut", () => {
  it("supports Ctrl (Windows) and Cmd (macOS)", () => {
    expect(resolveShortcut(key("o", { ctrlKey: true }))).toBe("open");
    expect(resolveShortcut(key("o", { metaKey: true }))).toBe("open");
  });

  it("maps zoom keys", () => {
    expect(resolveShortcut(key("=", { ctrlKey: true }))).toBe("zoom-in");
    expect(resolveShortcut(key("+", { ctrlKey: true, shiftKey: true }))).toBe("zoom-in");
    expect(resolveShortcut(key("-", { ctrlKey: true }))).toBe("zoom-out");
    expect(resolveShortcut(key("0", { metaKey: true }))).toBe("fit-page");
  });

  it("ignores plain arrows inside text fields", () => {
    expect(resolveShortcut(key("ArrowRight"))).toBe("next-page");
    expect(resolveShortcut(key("ArrowRight", { inTextField: true }))).toBeNull();
  });

  it("returns null for unrelated keys", () => {
    expect(resolveShortcut(key("o"))).toBeNull();
    expect(resolveShortcut(key("x", { ctrlKey: true }))).toBeNull();
  });
});
