import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSessionCache,
  getCachedAnalysis,
  getCachedDecisions,
  SESSION_CACHE_LIMIT,
  sha256Hex,
  storeAnalysis,
  storeDecisions,
} from "./sessionCache";

const page = { state: "ready" as const, items: [], lines: [], detections: [], noTextLayer: false };

describe("sessionCache", () => {
  beforeEach(() => clearSessionCache());

  it("hashes with SHA-256", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("stores analysis per OCR setting and decisions per document", () => {
    storeAnalysis("a", true, [page]);
    storeDecisions("a", { overrides: { k: "ignored" }, manual: [] });
    expect(getCachedAnalysis("a", true)).toHaveLength(1);
    expect(getCachedAnalysis("a", false)).toBeUndefined();
    expect(getCachedDecisions("a")?.overrides).toEqual({ k: "ignored" });
  });

  it("evicts the least recently used document", () => {
    for (let i = 0; i <= SESSION_CACHE_LIMIT; i++) storeAnalysis(`doc${i}`, true, [page]);
    expect(getCachedAnalysis("doc0", true)).toBeUndefined();
    expect(getCachedAnalysis(`doc${SESSION_CACHE_LIMIT}`, true)).toBeDefined();
  });
});
