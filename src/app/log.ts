/**
 * Development logger. Log counts and timings only — never document text (CLAUDE.md rule 9).
 */
const enabled = import.meta.env?.DEV ?? false;

export const log = {
  info(event: string, data?: Record<string, number | string | boolean>): void {
    if (enabled) console.info(`[vimask] ${event}`, data ?? "");
  },
  error(event: string, err: unknown): void {
    console.error(`[vimask] ${event}`, err instanceof Error ? err.message : err);
  },
};

export function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}
