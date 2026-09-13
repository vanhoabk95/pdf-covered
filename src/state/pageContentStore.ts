import { create } from "zustand";
import type { DetectionResult } from "../detection/types";
import type { TextLine } from "../grouping/types";
import type { PageContentUpdate } from "../pipeline/documentProcessor";
import type { PageProcessingState } from "../pipeline/processingQueue";
import type { PdfTextItem } from "../pdf/types";

export interface PageContent {
  state: PageProcessingState;
  items: PdfTextItem[];
  lines: TextLine[];
  detections: DetectionResult[];
  noTextLayer: boolean;
  /** Text on this page came from OCR (no text layer). */
  ocr?: boolean;
  ocrError?: string;
  error?: string;
  timings?: { extractMs: number; groupMs: number; detectMs: number; ocrMs?: number };
}

interface PageContentState {
  pages: PageContent[];
  /** Detection has been started for the open document (auto or by the user). */
  started: boolean;
  init(pageCount: number, started: boolean): void;
  start(): void;
  applyUpdate(pageIndex: number, update: PageContentUpdate): void;
  reset(): void;
}

const emptyPage = (): PageContent => ({ state: "pending", items: [], lines: [], detections: [], noTextLayer: false });

/** Per-page extraction results. Each page object is replaced on update, so selectors stay cheap. */
export const usePageContentStore = create<PageContentState>((set) => ({
  pages: [],
  started: false,
  init: (pageCount, started) => set({ pages: Array.from({ length: pageCount }, emptyPage), started }),
  start: () => set({ started: true }),
  applyUpdate: (pageIndex, update) =>
    set((s) => {
      const current = s.pages[pageIndex];
      if (!current) return s;
      const pages = s.pages.slice();
      pages[pageIndex] = { ...current, ...update };
      return { pages };
    }),
  reset: () => set({ pages: [], started: false }),
}));
