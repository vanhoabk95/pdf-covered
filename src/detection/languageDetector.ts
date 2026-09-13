import { francAll } from "franc-min";
import type { LanguageDetectionResult } from "./types";

/**
 * Offline trigram language identification (franc-min, MIT). Reliable for sentences, weak for
 * short or mixed technical lines — the Vietnamese detector uses it as supporting evidence only.
 */

const CANDIDATES = ["vie", "eng", "fra", "deu", "spa", "por", "ita", "nld", "ind", "kor", "jpn", "cmn"];

const ISO_639_1: Record<string, string> = {
  vie: "vi", eng: "en", fra: "fr", deu: "de", spa: "es", por: "pt", ita: "it", nld: "nl",
  ind: "id", kor: "ko", jpn: "ja", cmn: "zh",
};

const MIN_LENGTH = 10;

export interface TrigramGuess extends LanguageDetectionResult {
  /** franc's relative score for Vietnamese minus the best other language (-1..1). */
  vieMargin: number;
  /** 0..1 — how much to trust the guess given the text length. */
  reliability: number;
}

export function detectLanguage(text: string): TrigramGuess {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const reliability = Math.min(1, Math.max(0, (letters - MIN_LENGTH) / 40));
  if (letters < MIN_LENGTH) return { language: "und", confidence: 0, vieMargin: 0, reliability: 0 };

  const ranked = francAll(text, { only: CANDIDATES, minLength: MIN_LENGTH });
  const [bestCode, bestScore] = ranked[0] ?? ["und", 0];
  if (bestCode === "und") return { language: "und", confidence: 0, vieMargin: 0, reliability: 0 };

  const vie = ranked.find(([code]) => code === "vie")?.[1] ?? 0;
  const bestOther = ranked.find(([code]) => code !== "vie")?.[1] ?? 0;
  const second = ranked[1]?.[1] ?? 0;
  return {
    language: ISO_639_1[bestCode] ?? bestCode,
    // franc scores are relative (best = 1); the gap to the runner-up is a usable confidence.
    confidence: Math.min(1, Math.max(0, (bestScore - second) * 2 + 0.5)) * reliability,
    vieMargin: vie - bestOther,
    reliability,
  };
}
