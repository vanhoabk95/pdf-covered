import type { MaskDecisions } from "./maskStore";
import type { PageContent } from "./pageContentStore";

/**
 * In-memory, per-session cache keyed by SHA-256 of the file (spec §26). Nothing is written to
 * disk: extracted text and detections are document content and must not persist by default.
 */
export interface CachedDocument {
  /** Complete analysis, keyed by the OCR setting it was produced with. */
  analysis: Map<boolean, PageContent[]>;
  decisions?: MaskDecisions;
}

export const SESSION_CACHE_LIMIT = 3;

const cache = new Map<string, CachedDocument>();

function touch(hash: string): CachedDocument {
  let entry = cache.get(hash);
  if (entry) cache.delete(hash);
  else entry = { analysis: new Map() };
  cache.set(hash, entry);
  while (cache.size > SESSION_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return entry;
}

export function getCachedAnalysis(hash: string, ocrEnabled: boolean): PageContent[] | undefined {
  return cache.get(hash)?.analysis.get(ocrEnabled);
}

export function storeAnalysis(hash: string, ocrEnabled: boolean, pages: PageContent[]): void {
  touch(hash).analysis.set(ocrEnabled, pages);
}

export function getCachedDecisions(hash: string): MaskDecisions | undefined {
  return cache.get(hash)?.decisions;
}

export function storeDecisions(hash: string, decisions: MaskDecisions): void {
  touch(hash).decisions = decisions;
}

export function clearSessionCache(): void {
  cache.clear();
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
