import { describe, expect, it } from "vitest";
import { detectLanguage } from "./languageDetector";
import { HOLDOUT_LINES, LABELLED_LINES, type ExpectedTier } from "./labelledLines";
import { NAME_ONLY_CAP, PLAIN_TEXT_CAP, scoreVietnamese, vietnameseDetector } from "./vietnameseDetector";

const AUTO = 0.85;
const UNCERTAIN = 0.6;

function inTier(confidence: number, tier: ExpectedTier): boolean {
  switch (tier) {
    case "vi":
      return confidence >= AUTO;
    case "not":
      return confidence < UNCERTAIN;
    case "uncertain":
      return confidence >= UNCERTAIN && confidence < AUTO;
    case "notAuto":
      return confidence < AUTO;
  }
}

describe("Vietnamese detector — labelled lines", () => {
  it.each(LABELLED_LINES)("%j → %s", (text, tier) => {
    const { confidence } = scoreVietnamese(text);
    expect(inTier(confidence, tier), `confidence ${confidence}`).toBe(true);
  });
});

describe("Vietnamese detector — held-out regression set", () => {
  it.each(HOLDOUT_LINES)("%j → %s", (text, tier) => {
    expect(inTier(scoreVietnamese(text).confidence, tier)).toBe(true);
  });
});

describe("Vietnamese detector — guarantees", () => {
  it("never auto-masks text without Vietnamese diacritics", () => {
    for (const text of ["Kiem tra he thong truoc khi giao hang", "khong duoc cua nguoi voi cac mot theo"]) {
      expect(scoreVietnamese(text).confidence).toBeLessThanOrEqual(PLAIN_TEXT_CAP);
    }
  });

  it("keeps name-only lines uncertain at most", () => {
    for (const text of ["Nguyễn Văn A", "Trần Thị Mai", "Hải Phòng", "Việt Nam"]) {
      expect(scoreVietnamese(text).confidence).toBeLessThanOrEqual(NAME_ONLY_CAP);
    }
  });

  it("is deterministic and bounded", () => {
    const a = scoreVietnamese("Mục tiêu dự án");
    const b = scoreVietnamese("Mục tiêu dự án");
    expect(a.confidence).toBe(b.confidence);
    expect(a.confidence).toBeLessThanOrEqual(1);
    expect(scoreVietnamese("").confidence).toBe(0);
  });

  it("does not depend on Unicode normalization form", () => {
    const nfc = "Người phụ trách";
    expect(scoreVietnamese(nfc.normalize("NFD")).confidence).toBe(scoreVietnamese(nfc).confidence);
  });
});

describe("vietnameseDetector (LineDetector)", () => {
  it("returns one result per line with language and signals", () => {
    const results = vietnameseDetector.detect([
      { id: "l1", text: "Mục tiêu của dự án là cải thiện hệ thống." },
      { id: "l2", text: "The goal of this project is to improve the inspection system." },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ lineId: "l1", detector: "language:vi", language: "vi" });
    expect(results[1]).toMatchObject({ lineId: "l2", language: "en" });
    expect(results[1].confidence).toBeLessThan(0.1);
    expect(typeof results[0].signals.diacriticEvidence).toBe("number");
  });
});

describe("detectLanguage (trigram)", () => {
  it("identifies sentences and reports low reliability for short text", () => {
    expect(detectLanguage("Các bước kiểm tra phải được hoàn thành trước khi bàn giao.").language).toBe("vi");
    expect(detectLanguage("The goal of this project is to improve the inspection system.").language).toBe("en");
    expect(detectLanguage("OK").reliability).toBe(0);
    expect(detectLanguage("OK").language).toBe("und");
  });
});
