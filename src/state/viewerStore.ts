import { create } from "zustand";
import { clampZoom, nextZoomStep, type FitMode } from "../pdf/layout";
import type { BoundingBox } from "../pdf/types";

export type ViewerTool = "select" | "manual-mask";

export interface NavigationRequest {
  pageIndex: number;
  /** Optional PDF-space box to bring into view (e.g. a detection result). */
  focus?: BoundingBox;
  /** Increments on every request so repeated jumps to the same page still fire. */
  seq: number;
}

interface ViewerState {
  zoom: number;
  /** When set, zoom is derived from the container size (and follows window resizes). */
  fitMode: FitMode | null;
  currentPage: number;
  navigation: NavigationRequest | null;
  tool: ViewerTool;

  setZoom(zoom: number): void;
  zoomStep(direction: 1 | -1): void;
  setFitMode(mode: FitMode): void;
  /** Called by the viewer when fit mode recomputes zoom; keeps fitMode. */
  applyFitZoom(zoom: number): void;
  setCurrentPage(pageIndex: number): void;
  goToPage(pageIndex: number, focus?: BoundingBox): void;
  setTool(tool: ViewerTool): void;
  reset(): void;
}

let navSeq = 0;

export const useViewerStore = create<ViewerState>((set, get) => ({
  zoom: 1,
  fitMode: "width",
  currentPage: 0,
  navigation: null,
  tool: "select",

  setZoom: (zoom) => set({ zoom: clampZoom(zoom), fitMode: null }),
  zoomStep: (direction) => set({ zoom: nextZoomStep(get().zoom, direction), fitMode: null }),
  setFitMode: (mode) => set({ fitMode: mode }),
  applyFitZoom: (zoom) => {
    if (Math.abs(zoom - get().zoom) > 1e-4) set({ zoom });
  },
  setCurrentPage: (pageIndex) => {
    if (pageIndex !== get().currentPage) set({ currentPage: pageIndex });
  },
  goToPage: (pageIndex, focus) => set({ currentPage: pageIndex, navigation: { pageIndex, focus, seq: ++navSeq } }),
  setTool: (tool) => set({ tool }),
  reset: () => set({ zoom: 1, fitMode: "width", currentPage: 0, navigation: null, tool: "select" }),
}));
