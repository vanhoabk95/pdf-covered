import { create } from "zustand";

/** Debug overlay is development-only (spec §55); opt in for builds with VITE_ENABLE_DEBUG=true. */
export const DEBUG_AVAILABLE = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG === "true";

export interface DebugLayers {
  showItems: boolean;
  showLines: boolean;
  showLineText: boolean;
  showConfidence: boolean;
  showCoordinates: boolean;
}

interface DebugState extends DebugLayers {
  enabled: boolean;
  toggle(): void;
  setLayer(layer: keyof DebugLayers, value: boolean): void;
}

export const useDebugStore = create<DebugState>((set) => ({
  enabled: false,
  showItems: true,
  showLines: true,
  showLineText: false,
  showConfidence: true,
  showCoordinates: false,
  toggle: () => set((s) => ({ enabled: DEBUG_AVAILABLE && !s.enabled })),
  setLayer: (layer, value) => set({ [layer]: value } as Pick<DebugLayers, typeof layer>),
}));
