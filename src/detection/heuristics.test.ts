import { describe, expect, it } from "vitest";
import { computeSignals, tokenize } from "./heuristics";

describe("tokenize / names", () => {
  const names = (text: string) => tokenize(text).filter((t) => t.inName).map((t) => t.text);

  it("marks Vietnamese person names with or without diacritics", () => {
    expect(names("Người phụ trách: Nguyễn Văn A")).toEqual(["Nguyễn", "Văn", "A"]);
    expect(names("Nguyen Van A")).toEqual(["Nguyen", "Van", "A"]);
    expect(names("Prepared by Trần Thị Mai")).toEqual(["Trần", "Thị", "Mai"]);
  });

  it("marks place names", () => {
    expect(names("Hải Phòng")).toEqual(["Hải", "Phòng"]);
    expect(names("LG Display Vietnam")).toEqual(["Vietnam"]);
  });

  it("does not read Title-Case headings as names", () => {
    expect(names("Tổng Quan Dự Án")).toEqual([]);
    expect(names("Kế Hoạch Thực Hiện")).toEqual([]);
  });
});

describe("computeSignals", () => {
  it("gives strong evidence for a Vietnamese sentence", () => {
    const s = computeSignals("Mục tiêu của dự án là cải thiện hệ thống.");
    expect(s.diacriticEvidence).toBeGreaterThan(5);
    expect(s.viFunctionWords).toBe(2);
    expect(s.invalidDiacriticWords).toBe(0);
    expect(s.enFunctionWordRatio).toBe(0);
    expect(s.strongCharRatio).toBeGreaterThan(0.15);
  });

  it("counts technical English terms without penalty", () => {
    const s = computeSignals("Kiểm tra gamma value");
    expect(s.diacriticEvidence).toBe(1);
    expect(s.diacriticWordRatio).toBeCloseTo(0.25);
    expect(s.invalidDiacriticWords).toBe(0);
  });

  it("excludes names from diacritic evidence", () => {
    const s = computeSignals("Contact Nguyễn Văn A for details.");
    expect(s.diacriticEvidence).toBe(0);
    expect(s.nameTokens).toBe(3);
    expect(s.nameOnly).toBe(false);
    expect(computeSignals("Nguyễn Văn A").nameOnly).toBe(true);
  });

  it("flags accented words that cannot be Vietnamese", () => {
    const s = computeSignals("Résumé du système à vérifier");
    expect(s.invalidDiacriticWords).toBe(3);
  });

  it("weights short shared-accent words lower", () => {
    expect(computeSignals("à").diacriticEvidence).toBe(0.6);
    expect(computeSignals("lên").diacriticEvidence).toBe(1);
  });

  it("detects Vietnamese function words typed without diacritics", () => {
    const s = computeSignals("Nguoi phu trach khong duoc thay doi");
    expect(s.viPlainFunctionWords).toBe(3);
    expect(s.plainSyllableRatio).toBe(1);
    expect(s.diacriticEvidence).toBe(0);
  });

  it("handles empty and non-Latin text", () => {
    expect(computeSignals("").wordCount).toBe(0);
    expect(computeSignals("패널 검사 결과").diacriticEvidence).toBe(0);
  });
});
