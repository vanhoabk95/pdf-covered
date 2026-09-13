/**
 * Vietnamese syllable structure: (onset)(rhyme) + at most one tone mark.
 * Used to tell real Vietnamese words ("kiểm", "được") apart from other languages' accented
 * words ("café", "système") and to recognize Vietnamese typed without diacritics.
 */

const ONSETS = [
  "", "b", "c", "ch", "d", "đ", "g", "gh", "gi", "h", "k", "kh", "l", "m", "n", "ng", "ngh",
  "nh", "p", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x",
];

// Rhymes written without tone marks (vowel diacritics ă â ê ô ơ ư kept).
const RHYMES = [
  "a", "ai", "ao", "au", "ay", "am", "an", "ang", "anh", "ap", "at", "ac", "ach",
  "ă", "ăm", "ăn", "ăng", "ăp", "ăt", "ăc",
  "â", "âm", "ân", "âng", "âp", "ât", "âc", "âu", "ây",
  "e", "eo", "em", "en", "eng", "ep", "et", "ec",
  "ê", "êu", "êm", "ên", "ênh", "êp", "êt", "êch",
  "i", "ia", "iu", "im", "in", "inh", "ip", "it", "ich",
  "iêu", "iêm", "iên", "iêng", "iêp", "iêt", "iêc",
  "o", "oi", "om", "on", "ong", "op", "ot", "oc",
  "oa", "oai", "oao", "oay", "oam", "oan", "oang", "oanh", "oap", "oat", "oac", "oach",
  "oăm", "oăn", "oăng", "oăt", "oăc", "oe", "oeo", "oen", "oet", "ooc", "oong",
  "ô", "ôi", "ôm", "ôn", "ông", "ôp", "ôt", "ôc",
  "ơ", "ơi", "ơm", "ơn", "ơp", "ơt",
  "u", "ua", "ui", "um", "un", "ung", "up", "ut", "uc",
  "uân", "uâng", "uât", "uây", "uê", "uêch", "uênh", "uơ", "uy", "uya", "uych", "uyên", "uyêt",
  "uynh", "uyp", "uyt", "uyu", "uôi", "uôm", "uôn", "uông", "uôt", "uôc",
  "ư", "ưa", "ưi", "ưu", "ưm", "ưn", "ưng", "ưt", "ưc",
  "ươi", "ươu", "ươm", "ươn", "ương", "ươp", "ươt", "ươc",
  "y", "yêm", "yên", "yêng", "yêt", "yêu",
];

/** Combining tone marks: grave, acute, tilde, hook above, dot below. */
const TONE_MARKS = /[\u0300\u0301\u0303\u0309\u0323]/g;
const STOP_FINAL = /(p|t|c|ch)$/;
/** Tones allowed on syllables ending in a stop consonant: level (none), acute, dot below. */
const STOP_TONES = new Set(["", "\u0301", "\u0323"]);

function buildSyllables(): { marked: Set<string>; plain: Set<string> } {
  const marked = new Set<string>();
  for (const onset of ONSETS) {
    for (const rhyme of RHYMES) {
      // Spelling rules that keep the set tighter.
      if ((onset === "k" || onset === "gh" || onset === "ngh") && !/^[eêiy]/.test(rhyme)) continue;
      if ((onset === "c" || onset === "g" || onset === "ng") && /^[eêi]/.test(rhyme)) continue;
      if (onset === "qu" && /^[uo]/.test(rhyme)) continue; // but "quốc" (qu + ôc) is valid
      if (onset === "gi" && rhyme.startsWith("i")) continue;
      marked.add(onset + rhyme);
    }
  }
  marked.add("gi"); // "gì"
  const plain = new Set([...marked].map(stripAllMarks));
  return { marked, plain };
}

/** Removes every diacritic (tone and vowel marks) and maps đ → d. */
export function stripAllMarks(word: string): string {
  return word.normalize("NFD").replace(/[\u0300-\u036F]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

const { marked: MARKED_SYLLABLES, plain: PLAIN_SYLLABLES } = buildSyllables();

export interface SyllableAnalysis {
  /** Letters-only token is a well-formed Vietnamese syllable (diacritics respected). */
  valid: boolean;
  /** Carries a tone mark or Vietnamese vowel mark (ă â ê ô ơ ư đ). */
  hasDiacritics: boolean;
}

/** Analyses a single lowercase-able word token. */
export function analyzeSyllable(token: string): SyllableAnalysis {
  const lower = token.normalize("NFC").toLowerCase();
  const decomposed = lower.normalize("NFD");
  const tones = decomposed.match(TONE_MARKS) ?? [];
  const toneless = decomposed.replace(TONE_MARKS, "").normalize("NFC");
  const hasDiacritics = tones.length > 0 || /[ăâêôơưđ]/.test(toneless);

  if (tones.length > 1 || !MARKED_SYLLABLES.has(toneless)) return { valid: false, hasDiacritics };
  if (STOP_FINAL.test(toneless) && !STOP_TONES.has(tones[0] ?? "")) return { valid: false, hasDiacritics };
  return { valid: true, hasDiacritics };
}

/** True when the token could be a Vietnamese syllable typed without any diacritics. */
export function isPlainSyllable(token: string): boolean {
  return PLAIN_SYLLABLES.has(stripAllMarks(token.toLowerCase()));
}
