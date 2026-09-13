import { create } from "zustand";
import { DEFAULT_MASK_PADDING, type MaskPadding } from "../masking/maskGenerator";
import { DEFAULT_THRESHOLDS, type DetectionThresholds } from "../masking/thresholds";

/** Non-sensitive user settings (spec §41). Persistence is added in Phase E. */
interface SettingsState {
  thresholds: DetectionThresholds;
  showUncertain: boolean;
  maskPadding: MaskPadding;
  /** 0..1 — 1 fully obscures text (spec §14 default). */
  maskOpacity: number;

  setAutoThreshold(value: number): void;
  setShowUncertain(value: boolean): void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  thresholds: DEFAULT_THRESHOLDS,
  showUncertain: true,
  maskPadding: DEFAULT_MASK_PADDING,
  maskOpacity: 1,

  setAutoThreshold: (value) => set((s) => ({ thresholds: { ...s.thresholds, auto: value } })),
  setShowUncertain: (value) => set({ showUncertain: value }),
}));
