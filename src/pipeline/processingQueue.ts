export type PageProcessingState = "pending" | "extracting" | "ocr" | "detecting" | "ready" | "error";

/**
 * Picks the next page to process (spec §25):
 * current page → next → previous → remaining pages in sequence after the current page,
 * then the ones before it. Returns null when nothing is pending.
 */
export function nextPageToProcess(states: readonly PageProcessingState[], currentPage: number): number | null {
  const n = states.length;
  if (!n) return null;
  const current = Math.min(Math.max(currentPage, 0), n - 1);
  const candidates = [current, current + 1, current - 1];
  for (let i = current + 2; i < n; i++) candidates.push(i);
  for (let i = 0; i < current - 1; i++) candidates.push(i);
  return candidates.find((i) => i >= 0 && i < n && states[i] === "pending") ?? null;
}
