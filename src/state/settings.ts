import { DEFAULT_MASK_PADDING, type MaskPadding } from "../masking/maskGenerator";
import { DEFAULT_THRESHOLDS, SENSITIVITY_PRESETS, type DetectionThresholds } from "../masking/thresholds";

export type Sensitivity = keyof typeof SENSITIVITY_PRESETS | "custom";

/** Non-sensitive user settings (spec §41). Never contains document content or passwords. */
export interface Settings {
  thresholds: DetectionThresholds;
  showUncertain: boolean;
  /** true: uncertain regions get a translucent fill; false: outline highlight only. */
  fillUncertain: boolean;
  maskPadding: MaskPadding;
  /** 0.5..1 — 1 fully obscures text (spec §14 default). */
  maskOpacity: number;
  autoDetect: boolean;
  ocrEnabled: boolean;
}

export const SETTINGS_VERSION = 1;
export const SETTINGS_STORAGE_KEY = "vimask.settings";

export const DEFAULT_SETTINGS: Settings = {
  thresholds: DEFAULT_THRESHOLDS,
  showUncertain: true,
  fillUncertain: false,
  maskPadding: DEFAULT_MASK_PADDING,
  maskOpacity: 1,
  autoDetect: true,
  ocrEnabled: true,
};

export function sensitivityOf(thresholds: DetectionThresholds): Sensitivity {
  const match = (Object.keys(SENSITIVITY_PRESETS) as (keyof typeof SENSITIVITY_PRESETS)[]).find(
    (k) => Math.abs(SENSITIVITY_PRESETS[k] - thresholds.auto) < 1e-6,
  );
  return match ?? "custom";
}

const clamp = (n: unknown, min: number, max: number, fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Parses stored settings defensively: unknown or invalid fields fall back to defaults. */
export function parseSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (!data || typeof data !== "object" || (data as { version?: unknown }).version !== SETTINGS_VERSION) {
    return DEFAULT_SETTINGS;
  }
  const s = (data as { settings?: Partial<Settings> }).settings ?? {};
  const d = DEFAULT_SETTINGS;
  const auto = clamp(s.thresholds?.auto, 0.5, 0.99, d.thresholds.auto);
  return {
    thresholds: { auto, uncertain: clamp(s.thresholds?.uncertain, 0.3, auto, Math.min(d.thresholds.uncertain, auto)) },
    showUncertain: bool(s.showUncertain, d.showUncertain),
    fillUncertain: bool(s.fillUncertain, d.fillUncertain),
    maskPadding: {
      x: clamp(s.maskPadding?.x, 0, 12, d.maskPadding.x),
      y: clamp(s.maskPadding?.y, 0, 12, d.maskPadding.y),
    },
    maskOpacity: clamp(s.maskOpacity, 0.5, 1, d.maskOpacity),
    autoDetect: bool(s.autoDetect, d.autoDetect),
    ocrEnabled: bool(s.ocrEnabled, d.ocrEnabled),
  };
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify({ version: SETTINGS_VERSION, settings });
}
