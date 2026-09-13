import { analyzeSyllable, isPlainSyllable, stripAllMarks } from "./syllables";

/**
 * Fast, explainable Vietnamese signals for one line of text (spec §10 layer 1, §32–§34).
 * These are evidence, not a verdict — vietnameseDetector combines them.
 */

/** Letters that essentially only occur in Vietnamese among Latin-script languages. */
const STRONG_VI_CHARS = /[ăđơưĩũĂĐƠƯĨŨẠ-ỹ]/u;
/** Accented letters Vietnamese shares with French, Portuguese, Spanish… */
const WEAK_VI_CHARS = /[àáâãèéêìíòóôõùúýÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝ]/u;

/** High-frequency Vietnamese function words (with diacritics). */
const VI_FUNCTION_WORDS = new Set([
  "và", "của", "cho", "trong", "không", "được", "các", "một", "với", "người", "theo", "khi",
  "từ", "là", "có", "này", "những", "để", "đã", "sẽ", "bị", "lên", "trước", "sau", "đến",
  "như", "cũng", "hoặc", "nếu", "thì", "mà", "nên", "vì", "phải", "cần", "đang", "rất",
  "nhiều", "đó", "đây", "tại", "về", "ra", "vào", "bằng", "hơn", "chưa", "đều", "lại",
]);

/**
 * Function words recognizable without diacritics. Only forms that are not common English
 * words are listed ("can", "to", "the", "me"… would be false evidence).
 */
const VI_PLAIN_FUNCTION_WORDS = new Set([
  "khong", "duoc", "cua", "nguoi", "nhung", "voi", "cac", "mot", "theo", "truoc", "nhieu",
  "cung", "hoac", "neu", "phai", "dang", "trong", "thi", "vao", "bang", "chua", "khi",
]);

const EN_FUNCTION_WORDS = new Set([
  "the", "of", "and", "to", "in", "is", "for", "on", "with", "this", "that", "be", "are", "must",
  "after", "before", "from", "by", "as", "at", "or", "it", "will", "should", "not", "was", "were",
  "has", "have", "can", "all", "if", "an", "a", "our", "we", "you", "they", "into", "than",
]);

/** Common Vietnamese surnames (diacritics stripped). */
const VI_SURNAMES = new Set([
  "nguyen", "tran", "le", "pham", "hoang", "huynh", "phan", "vu", "vo", "dang", "bui", "do",
  "ho", "ngo", "duong", "ly", "dinh", "trinh", "mai", "cao", "lam", "truong", "ta", "ha",
  "luong", "thai", "quach", "tong", "chu", "kieu", "dao", "dam", "khuc", "lai", "tang", "doan",
]);

/** Common Vietnamese middle names (diacritics stripped). */
const VI_MIDDLE_NAMES = new Set([
  "van", "thi", "duc", "minh", "huu", "quoc", "ngoc", "thanh", "xuan", "anh", "hoang", "kim",
  "cong", "dinh", "thu", "bao", "gia", "hong", "manh", "tuan", "quang", "phuong", "my", "tien",
]);

/** Place / organization words that make a Title-Case run a proper noun (diacritics stripped). */
const VI_PLACE_WORDS = new Set([
  "vietnam", "viet", "nam", "ha", "noi", "hai", "phong", "da", "nang", "ho", "chi", "minh",
  "sai", "gon", "bac", "ninh", "hung", "yen", "thai", "nguyen", "binh", "duong", "dong", "nai",
  "can", "tho", "hue", "vinh", "phuc", "quang", "long", "an", "giang", "thanh", "hoa",
]);

export interface TokenInfo {
  text: string;
  lower: string;
  hasStrongChar: boolean;
  hasWeakChar: boolean;
  /** Well-formed Vietnamese syllable with diacritics taken into account. */
  validSyllable: boolean;
  /** Could be a Vietnamese syllable if diacritics were omitted. */
  plainSyllable: boolean;
  titleCase: boolean;
  /** Part of a detected proper-noun run (person or place name). */
  inName: boolean;
}

export interface HeuristicSignals {
  letterCount: number;
  wordCount: number;
  /** Letters that are Vietnamese-specific / all letters. */
  strongCharRatio: number;
  /** Evidence from valid diacritic syllables that are not names (1 each; 0.6 for short shared-accent words). */
  diacriticEvidence: number;
  /** Share of word tokens carrying Vietnamese diacritics and forming valid syllables (names excluded). */
  diacriticWordRatio: number;
  /** Tokens with diacritics that are NOT valid Vietnamese syllables (French, Portuguese…). */
  invalidDiacriticRatio: number;
  invalidDiacriticWords: number;
  viFunctionWords: number;
  viPlainFunctionWords: number;
  enFunctionWordRatio: number;
  /** Share of tokens that are Vietnamese syllables when diacritics are ignored. */
  plainSyllableRatio: number;
  /** All letter tokens belong to person/place names (or single-letter initials). */
  nameOnly: boolean;
  nameTokens: number;
}

const WORD = /\p{L}+/gu;

export function tokenize(text: string): TokenInfo[] {
  const words = text.normalize("NFC").match(WORD) ?? [];
  const tokens = words.map((w) => {
    const lower = w.toLowerCase();
    const syllable = analyzeSyllable(w);
    return {
      text: w,
      lower,
      hasStrongChar: STRONG_VI_CHARS.test(w),
      hasWeakChar: WEAK_VI_CHARS.test(w),
      validSyllable: syllable.valid,
      plainSyllable: isPlainSyllable(w),
      titleCase: /^\p{Lu}\p{Ll}*$/u.test(w),
      inName: false,
    };
  });
  markNames(tokens);
  return tokens;
}

/**
 * Marks Title-Case runs that look like Vietnamese person names ("Nguyễn Văn A") or place /
 * organization names ("Hải Phòng", "Việt Nam"). A run needs ≥ 2 tokens and must start with a
 * surname or consist of place words.
 */
function markNames(tokens: TokenInfo[]): void {
  let i = 0;
  while (i < tokens.length) {
    if (!isNameCandidate(tokens[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < tokens.length && isNameCandidate(tokens[j])) j++;
    const run = tokens.slice(i, j);
    const keys = run.map((t) => stripAllMarks(t.lower));
    // Surname + (middle name | initial). Avoids reading Title-Case headings such as
    // "Tổng Quan Dự Án" (Tổng is also a surname) as a person.
    const personName =
      run.length >= 2 &&
      run.length <= 4 &&
      VI_SURNAMES.has(keys[0]) &&
      (run.length === 2 || VI_MIDDLE_NAMES.has(keys[1]) || /^\p{Lu}$/u.test(run[run.length - 1].text));
    const placeName = run.length >= 1 && keys.every((k) => VI_PLACE_WORDS.has(k));
    if (personName || (placeName && (run.length >= 2 || keys[0] === "vietnam"))) {
      run.forEach((t) => (t.inName = true));
    }
    i = j;
  }
}

function isNameCandidate(t: TokenInfo): boolean {
  // Title case syllable, or a single capital initial ("A" in "Nguyễn Văn A").
  return (t.titleCase && t.plainSyllable) || /^\p{Lu}$/u.test(t.text) || t.lower === "vietnam";
}

export function computeSignals(text: string): HeuristicSignals {
  const tokens = tokenize(text);
  const letters = (text.normalize("NFC").match(/\p{L}/gu) ?? []).length;
  const strongLetters = (text.normalize("NFC").match(new RegExp(STRONG_VI_CHARS.source, "gu")) ?? []).length;
  const wordCount = tokens.length;

  let diacriticEvidence = 0;
  let diacriticWords = 0;
  let invalidDiacritic = 0;
  let viFunctionWords = 0;
  let viPlainFunctionWords = 0;
  let enFunctionWords = 0;
  let plainSyllables = 0;
  let nameTokens = 0;

  for (const t of tokens) {
    const accented = t.hasStrongChar || t.hasWeakChar;
    if (t.inName) nameTokens++;
    if (accented && t.validSyllable && !t.inName) {
      // Short words with only shared accents ("à", "là", "é") also occur in French/Portuguese.
      diacriticEvidence += t.hasStrongChar || t.text.length >= 3 ? 1 : 0.6;
      diacriticWords++;
    }
    if (accented && !t.validSyllable) invalidDiacritic++;
    if (VI_FUNCTION_WORDS.has(t.lower)) viFunctionWords++;
    else if (!accented && VI_PLAIN_FUNCTION_WORDS.has(t.lower)) viPlainFunctionWords++;
    if (EN_FUNCTION_WORDS.has(t.lower)) enFunctionWords++;
    if (t.plainSyllable) plainSyllables++;
  }

  const nameOnly =
    wordCount > 0 && nameTokens > 0 && tokens.every((t) => t.inName || /^\p{Lu}$/u.test(t.text));

  return {
    letterCount: letters,
    wordCount,
    strongCharRatio: letters ? strongLetters / letters : 0,
    diacriticEvidence,
    diacriticWordRatio: wordCount ? diacriticWords / wordCount : 0,
    invalidDiacriticRatio: wordCount ? invalidDiacritic / wordCount : 0,
    invalidDiacriticWords: invalidDiacritic,
    viFunctionWords,
    viPlainFunctionWords,
    enFunctionWordRatio: wordCount ? enFunctionWords / wordCount : 0,
    plainSyllableRatio: wordCount ? plainSyllables / wordCount : 0,
    nameOnly,
    nameTokens,
  };
}
