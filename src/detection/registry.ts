import type { DetectableLine, DetectionResult, LineDetector } from "./types";
import { vietnameseDetector } from "./vietnameseDetector";

/** Detectors run on every line. Phase 3 adds PII / regex / keyword detectors here. */
export const ACTIVE_DETECTORS: readonly LineDetector[] = [vietnameseDetector];

export function runDetectors(
  lines: readonly DetectableLine[],
  detectors: readonly LineDetector[] = ACTIVE_DETECTORS,
): DetectionResult[] {
  return detectors.flatMap((d) => d.detect(lines));
}
