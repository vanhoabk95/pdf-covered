import { describe, expect, it } from "vitest";
import { classifyConfidence, DEFAULT_THRESHOLDS, SENSITIVITY_PRESETS } from "./thresholds";

describe("classifyConfidence", () => {
  it("uses spec §11 defaults", () => {
    expect(classifyConfidence(0.85)).toBe("auto");
    expect(classifyConfidence(0.849)).toBe("uncertain");
    expect(classifyConfidence(0.6)).toBe("uncertain");
    expect(classifyConfidence(0.599)).toBe("none");
  });

  it("follows configurable thresholds", () => {
    const high = { ...DEFAULT_THRESHOLDS, auto: SENSITIVITY_PRESETS.high };
    expect(classifyConfidence(0.7, high)).toBe("auto");
    const strict = { ...DEFAULT_THRESHOLDS, auto: SENSITIVITY_PRESETS.strict };
    expect(classifyConfidence(0.9, strict)).toBe("uncertain");
  });

  it("handles an uncertain threshold above the auto threshold", () => {
    expect(classifyConfidence(0.62, { auto: 0.6, uncertain: 0.7 })).toBe("auto");
    expect(classifyConfidence(0.59, { auto: 0.6, uncertain: 0.7 })).toBe("none");
  });
});
