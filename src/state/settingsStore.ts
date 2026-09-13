import { create } from "zustand";
import { SENSITIVITY_PRESETS } from "../masking/thresholds";
import {
  DEFAULT_SETTINGS,
  parseSettings,
  serializeSettings,
  SETTINGS_STORAGE_KEY,
  type Sensitivity,
  type Settings,
} from "./settings";

interface SettingsState extends Settings {
  setSensitivity(sensitivity: Exclude<Sensitivity, "custom">): void;
  setAutoThreshold(value: number): void;
  setUncertainThreshold(value: number): void;
  update(patch: Partial<Settings>): void;
  resetToDefaults(): void;
}

function readStored(): Settings {
  try {
    return parseSettings(globalThis.localStorage?.getItem(SETTINGS_STORAGE_KEY) ?? null);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persist(settings: Settings): void {
  try {
    globalThis.localStorage?.setItem(SETTINGS_STORAGE_KEY, serializeSettings(settings));
  } catch {
    // Storage unavailable (private mode, quota): settings stay in memory for this session.
  }
}

const pick = (s: SettingsState): Settings => ({
  thresholds: s.thresholds,
  showUncertain: s.showUncertain,
  fillUncertain: s.fillUncertain,
  maskPadding: s.maskPadding,
  maskOpacity: s.maskOpacity,
  autoDetect: s.autoDetect,
  ocrEnabled: s.ocrEnabled,
});

export const useSettingsStore = create<SettingsState>((set, get) => {
  const apply = (patch: Partial<Settings>) => {
    set(patch);
    persist(pick(get()));
  };

  return {
    ...readStored(),

    setSensitivity: (sensitivity) => {
      const auto = SENSITIVITY_PRESETS[sensitivity];
      const { thresholds } = get();
      apply({ thresholds: { auto, uncertain: Math.min(thresholds.uncertain, auto) } });
    },
    setAutoThreshold: (value) => {
      const { thresholds } = get();
      apply({ thresholds: { auto: value, uncertain: Math.min(thresholds.uncertain, value) } });
    },
    setUncertainThreshold: (value) => {
      const { thresholds } = get();
      apply({ thresholds: { ...thresholds, uncertain: Math.min(value, thresholds.auto) } });
    },
    update: (patch) => apply(patch),
    resetToDefaults: () => apply(DEFAULT_SETTINGS),
  };
});
