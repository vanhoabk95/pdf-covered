import { describe, expect, it } from "vitest";
import { analyzeSyllable, isPlainSyllable, stripAllMarks } from "./syllables";

describe("analyzeSyllable", () => {
  it.each(["mục", "tiêu", "của", "được", "người", "nghiêng", "khuyết", "quốc", "giữ", "gì", "Đường", "TỔNG", "oẳn", "xoáy"])(
    "accepts Vietnamese syllable %s",
    (word) => {
      expect(analyzeSyllable(word)).toEqual({ valid: true, hasDiacritics: true });
    },
  );

  it.each(["café", "système", "résumé", "prüfen", "año", "vérifier", "très"])("rejects foreign accented word %s", (word) => {
    const r = analyzeSyllable(word);
    expect(r.valid).toBe(false);
  });

  it("rejects more than one tone mark", () => {
    expect(analyzeSyllable("mụcá").valid).toBe(false);
    expect(analyzeSyllable("ấạ").valid).toBe(false);
  });

  it("allows only acute or dot-below tones on stop-final syllables", () => {
    expect(analyzeSyllable("tốt").valid).toBe(true);
    expect(analyzeSyllable("một").valid).toBe(true);
    expect(analyzeSyllable("tồt").valid).toBe(false);
    expect(analyzeSyllable("hỏc").valid).toBe(false);
  });

  it("applies spelling rules for k/c and gh/g", () => {
    expect(analyzeSyllable("kiểm").valid).toBe(true);
    expect(analyzeSyllable("ciểm").valid).toBe(false);
    expect(analyzeSyllable("ghế").valid).toBe(true);
    expect(analyzeSyllable("gế").valid).toBe(false);
  });

  it("recognizes plain (diacritic-free) syllables and words that aren't", () => {
    expect(analyzeSyllable("tra")).toEqual({ valid: true, hasDiacritics: false });
    expect(isPlainSyllable("nguoi")).toBe(true);
    expect(isPlainSyllable("truoc")).toBe(true);
    expect(isPlainSyllable("server")).toBe(false);
    expect(isPlainSyllable("gamma")).toBe(false);
  });

  it("handles decomposed input", () => {
    expect(analyzeSyllable("mục").valid).toBe(true);
  });
});

describe("stripAllMarks", () => {
  it("removes tones and vowel marks, maps đ", () => {
    expect(stripAllMarks("Đường ổn định")).toBe("Duong on dinh");
  });
});
