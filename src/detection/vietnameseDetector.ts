import { computeSignals, type HeuristicSignals } from "./heuristics";
import { detectLanguage, type TrigramGuess } from "./languageDetector";
import type { DetectableLine, DetectionResult, LineDetector } from "./types";

export const VIETNAMESE_DETECTOR_ID = "language:vi";

/**
 * Hand-tuned weights of a logistic combination. Kept in one place and validated by the
 * labelled table in vietnameseDetector.test.ts — change weights only together with that table.
 */
export const WEIGHTS = {
  bias: -3.2,
  /** First unit of diacritic evidence (one real Vietnamese word) is decisive… */
  firstDiacriticWord: 4.6,
  /** …further words add more, with diminishing returns. */
  moreDiacriticWords: 0.9,
  diacriticWordRatio: 2.0,
  viFunctionWord: 1.2,
  viPlainFunctionWord: 0.9,
  plainSyllableRatio: 2.0,
  trigramVieMargin: 1.6,
  invalidDiacriticRatio: -5.0,
  /** Each accented word that can't be Vietnamese ("café", "système") is strong counter-evidence. */
  invalidDiacriticWord: -2.0,
  enFunctionWordRatio: -4.0,
};

/** Lines without any diacritics can reach at most "uncertain" (spec §56: honesty). */
export const PLAIN_TEXT_CAP = 0.78;
/** Name-only lines ("Nguyễn Văn A", "Hải Phòng") are capped to "uncertain" (spec §33). */
export const NAME_ONLY_CAP = 0.7;

export function scoreVietnamese(text: string): { confidence: number; signals: HeuristicSignals; trigram: TrigramGuess } {
  const s = computeSignals(text);
  const trigram = detectLanguage(text);
  if (s.letterCount === 0) return { confidence: 0, signals: s, trigram };

  const w = WEIGHTS;
  let logit =
    w.bias +
    w.firstDiacriticWord * Math.min(s.diacriticEvidence, 1) +
    w.moreDiacriticWords * Math.min(Math.max(s.diacriticEvidence - 1, 0), 3) +
    w.diacriticWordRatio * s.diacriticWordRatio +
    w.viFunctionWord * Math.min(s.viFunctionWords, 2) +
    w.viPlainFunctionWord * Math.min(s.viPlainFunctionWords, 3) +
    w.invalidDiacriticRatio * s.invalidDiacriticRatio +
    w.invalidDiacriticWord * Math.min(s.invalidDiacriticWords, 2) +
    w.enFunctionWordRatio * s.enFunctionWordRatio +
    w.trigramVieMargin * trigram.vieMargin * trigram.reliability;

  // Plain-syllable evidence only counts for diacritic-free text that is not a proper noun.
  if (s.diacriticEvidence === 0 && !s.nameOnly && s.wordCount >= 3) {
    logit += w.plainSyllableRatio * (s.plainSyllableRatio >= 0.999 ? 1 : 0);
  }

  let confidence = sigmoid(logit);
  if (s.diacriticEvidence === 0) confidence = Math.min(confidence, PLAIN_TEXT_CAP);
  if (s.nameOnly) confidence = Math.min(Math.max(confidence, s.strongCharRatio > 0 ? NAME_ONLY_CAP : 0), NAME_ONLY_CAP);
  return { confidence: round3(confidence), signals: s, trigram };
}

export const vietnameseDetector: LineDetector = {
  id: VIETNAMESE_DETECTOR_ID,
  detect(lines: readonly DetectableLine[]): DetectionResult[] {
    return lines.map((line) => {
      const { confidence, signals, trigram } = scoreVietnamese(line.text);
      return {
        lineId: line.id,
        detector: VIETNAMESE_DETECTOR_ID,
        language: confidence >= 0.5 ? "vi" : trigram.language,
        confidence,
        signals: {
          ...signals,
          trigramVieMargin: round3(trigram.vieMargin),
          trigramReliability: round3(trigram.reliability),
        },
      };
    });
  },
};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
