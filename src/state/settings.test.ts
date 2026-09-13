import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings, sensitivityOf, serializeSettings, SETTINGS_VERSION } from "./settings";

describe("settings persistence", () => {
  it("round-trips", () => {
    const custom = { ...DEFAULT_SETTINGS, thresholds: { auto: 0.95, uncertain: 0.7 }, ocrEnabled: false, maskOpacity: 0.8 };
    expect(parseSettings(serializeSettings(custom))).toEqual(custom);
  });

  it("falls back to defaults for missing, corrupt or old data", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("{not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ version: SETTINGS_VERSION - 1, settings: {} }))).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps invalid values field by field", () => {
    const parsed = parseSettings(
      JSON.stringify({
        version: SETTINGS_VERSION,
        settings: { thresholds: { auto: 5, uncertain: 0.99 }, maskOpacity: 0.1, maskPadding: { x: "big", y: -3 }, autoDetect: "yes" },
      }),
    );
    expect(parsed.thresholds.auto).toBe(0.99);
    expect(parsed.thresholds.uncertain).toBeLessThanOrEqual(parsed.thresholds.auto);
    expect(parsed.maskOpacity).toBe(0.5);
    expect(parsed.maskPadding).toEqual({ x: DEFAULT_SETTINGS.maskPadding.x, y: 0 });
    expect(parsed.autoDetect).toBe(DEFAULT_SETTINGS.autoDetect);
  });

  it("maps thresholds to sensitivity presets (spec §16)", () => {
    expect(sensitivityOf({ auto: 0.65, uncertain: 0.6 })).toBe("high");
    expect(sensitivityOf({ auto: 0.85, uncertain: 0.6 })).toBe("normal");
    expect(sensitivityOf({ auto: 0.95, uncertain: 0.6 })).toBe("strict");
    expect(sensitivityOf({ auto: 0.9, uncertain: 0.6 })).toBe("custom");
  });
});
