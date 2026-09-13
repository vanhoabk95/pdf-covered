/** Confidence tiers (spec §11). Tiers are derived, never stored, so threshold changes apply instantly. */
export type ConfidenceTier = "auto" | "uncertain" | "none";

export interface DetectionThresholds {
  /** confidence ≥ auto → masked automatically. */
  auto: number;
  /** uncertain ≤ confidence < auto → flagged as uncertain. */
  uncertain: number;
}

export const DEFAULT_THRESHOLDS: DetectionThresholds = { auto: 0.85, uncertain: 0.6 };

/** Spec §16 sensitivity presets (auto threshold). */
export const SENSITIVITY_PRESETS = {
  high: 0.65,
  normal: 0.85,
  strict: 0.95,
} as const;

export function classifyConfidence(confidence: number, thresholds: DetectionThresholds = DEFAULT_THRESHOLDS): ConfidenceTier {
  if (confidence >= thresholds.auto) return "auto";
  if (confidence >= Math.min(thresholds.uncertain, thresholds.auto)) return "uncertain";
  return "none";
}
