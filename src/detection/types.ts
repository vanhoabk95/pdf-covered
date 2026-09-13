/** Serializable input for detectors (a text line, stripped of geometry). */
export interface DetectableLine {
  id: string;
  text: string;
}

/** Spec §9: language guess with confidence. */
export interface LanguageDetectionResult {
  language: string;
  confidence: number;
}

/**
 * Output of any detector for one line. Detectors are generic (CLAUDE.md rule 3): the Vietnamese
 * detector is one implementation; PII / regex / keyword detectors plug in the same way.
 */
export interface DetectionResult {
  lineId: string;
  /** Detector id, e.g. "language:vi". */
  detector: string;
  /** Best language guess for the line (ISO 639-1 when known, "und" otherwise). */
  language: string;
  /** Probability (0..1) that the line matches what this detector hides. */
  confidence: number;
  /** Explainable evidence for debugging and the inspector. Numbers or booleans only. */
  signals: Record<string, number | boolean>;
}

export interface LineDetector {
  id: string;
  detect(lines: readonly DetectableLine[]): DetectionResult[];
}
