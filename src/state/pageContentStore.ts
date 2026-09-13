import { create } from "zustand";
import type { TextLine } from "../grouping/types";
import type { PageContentUpdate } from "../pipeline/documentProcessor";
import type { PageProcessingState } from "../pipeline/processingQueue";
import type { PdfTextItem } from "../pdf/types";

export interface PageContent {
  state: PageProcessingState;
  items: PdfTextItem[];
  lines: TextLine[];
  noTextLayer: boolean;
  error?: string;
  timings?: { extractMs: number; groupMs: number };
}

interface PageContentState {
  pages: PageContent[];
  init(pageCount: number): void;
  applyUpdate(pageIndex: number, update: PageContentUpdate): void;
  reset(): void;
}

const emptyPage = (): PageContent => ({ state: "pending", items: [], lines: [], noTextLayer: false });

/** Per-page extraction results. Each page object is replaced on update, so selectors stay cheap. */
export const usePageContentStore = create<PageContentState>((set) => ({
  pages: [],
  init: (pageCount) => set({ pages: Array.from({ length: pageCount }, emptyPage) }),
  applyUpdate: (pageIndex, update) =>
    set((s) => {
      const current = s.pages[pageIndex];
      if (!current) return s;
      const pages = s.pages.slice();
      pages[pageIndex] = { ...current, ...update };
      return { pages };
    }),
  reset: () => set({ pages: [] }),
}));
