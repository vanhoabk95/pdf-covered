import { create } from "zustand";
import { createHistory, pushHistory, redoHistory, undoHistory, type History } from "../masking/history";
import type { MaskOverride, MaskRegion } from "../masking/types";

/** Undoable user decisions (spec §37). */
export interface MaskDecisions {
  /** regionKey → user override for detector masks. */
  overrides: Readonly<Record<string, MaskOverride>>;
  /** User-drawn masks (Phase E manual tool). */
  manual: readonly MaskRegion[];
}

export interface InspectorTarget {
  key: string;
  pageIndex: number;
  /** Viewport (client) coordinates to anchor the popover. */
  anchor: { x: number; y: number };
}

interface MaskState {
  /** Global visual masking toggle (spec §16). Not undoable. */
  masksEnabled: boolean;
  history: History<MaskDecisions>;
  /** Regions temporarily shown ("Show original"). View state, not undoable. */
  revealed: Readonly<Record<string, true>>;
  inspector: InspectorTarget | null;
  /** Region to flash after navigation from the results list. */
  highlightKey: string | null;

  toggleMasks(): void;
  setMasksEnabled(enabled: boolean): void;
  setOverride(key: string, override: MaskOverride | null): void;
  addManualMask(mask: MaskRegion): void;
  removeManualMask(key: string): void;
  setRevealed(key: string, revealed: boolean): void;
  undo(): void;
  redo(): void;
  openInspector(target: InspectorTarget): void;
  closeInspector(): void;
  flash(key: string): void;
  /** Restores decisions from the session cache as a fresh history (not undoable). */
  restoreDecisions(decisions: MaskDecisions): void;
  reset(): void;
}

const emptyDecisions: MaskDecisions = { overrides: {}, manual: [] };

export const useMaskStore = create<MaskState>((set, get) => {
  const commit = (update: (d: MaskDecisions) => MaskDecisions) =>
    set((s) => ({ history: pushHistory(s.history, update(s.history.present)) }));

  return {
    masksEnabled: true,
    history: createHistory(emptyDecisions),
    revealed: {},
    inspector: null,
    highlightKey: null,

    toggleMasks: () => set((s) => ({ masksEnabled: !s.masksEnabled, inspector: null })),
    setMasksEnabled: (enabled) => set({ masksEnabled: enabled }),

    setOverride: (key, override) =>
      commit((d) => {
        if ((d.overrides[key] ?? null) === override) return d;
        const overrides = { ...d.overrides };
        if (override) overrides[key] = override;
        else delete overrides[key];
        return { ...d, overrides };
      }),

    addManualMask: (mask) => commit((d) => ({ ...d, manual: [...d.manual, { ...mask, status: "manual" }] })),
    removeManualMask: (key) =>
      commit((d) => (d.manual.some((m) => m.key === key) ? { ...d, manual: d.manual.filter((m) => m.key !== key) } : d)),

    setRevealed: (key, revealed) =>
      set((s) => {
        const next = { ...s.revealed };
        if (revealed) next[key] = true;
        else delete next[key];
        return { revealed: next };
      }),

    undo: () => set((s) => ({ history: undoHistory(s.history), inspector: null })),
    redo: () => set((s) => ({ history: redoHistory(s.history), inspector: null })),

    openInspector: (target) => set({ inspector: target }),
    closeInspector: () => {
      if (get().inspector) set({ inspector: null });
    },

    flash: (key) => {
      set({ highlightKey: key });
      window.setTimeout(() => {
        if (get().highlightKey === key) set({ highlightKey: null });
      }, 1600);
    },

    restoreDecisions: (decisions) => set({ history: createHistory(decisions) }),

    reset: () =>
      set({ masksEnabled: true, history: createHistory(emptyDecisions), revealed: {}, inspector: null, highlightKey: null }),
  };
});

export const selectDecisions = (s: MaskState) => s.history.present;
export const selectCanUndo = (s: MaskState) => s.history.past.length > 0;
export const selectCanRedo = (s: MaskState) => s.history.future.length > 0;
