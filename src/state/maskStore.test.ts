import { beforeEach, describe, expect, it } from "vitest";
import type { MaskRegion } from "../masking/types";
import { selectCanRedo, selectCanUndo, selectDecisions, useMaskStore } from "./maskStore";

const manual = (key: string): MaskRegion => ({
  id: `m-${key}`,
  key,
  pageIndex: 0,
  bbox: { x: 10, y: 10, width: 50, height: 12 },
  sourceText: "",
  detector: "manual",
  language: "und",
  confidence: 1,
  status: "manual",
  visible: true,
});

const store = () => useMaskStore.getState();
const decisions = () => selectDecisions(useMaskStore.getState());

describe("maskStore", () => {
  beforeEach(() => store().reset());

  it("ignores and restores a region with undo/redo", () => {
    store().setOverride("k1", "ignored");
    expect(decisions().overrides).toEqual({ k1: "ignored" });

    store().setOverride("k1", null); // restore
    expect(decisions().overrides).toEqual({});

    store().undo();
    expect(decisions().overrides).toEqual({ k1: "ignored" });
    store().undo();
    expect(decisions().overrides).toEqual({});
    expect(selectCanUndo(useMaskStore.getState())).toBe(false);

    store().redo();
    store().redo();
    expect(decisions().overrides).toEqual({});
    expect(selectCanRedo(useMaskStore.getState())).toBe(false);
  });

  it("does not record no-op changes", () => {
    store().setOverride("k1", "confirmed");
    store().setOverride("k1", "confirmed");
    store().undo();
    expect(decisions().overrides).toEqual({});
    expect(selectCanUndo(useMaskStore.getState())).toBe(false);
  });

  it("new actions clear the redo stack", () => {
    store().setOverride("a", "ignored");
    store().undo();
    store().setOverride("b", "confirmed");
    expect(selectCanRedo(useMaskStore.getState())).toBe(false);
    expect(decisions().overrides).toEqual({ b: "confirmed" });
  });

  it("creates and deletes manual masks undoably", () => {
    store().addManualMask(manual("m1"));
    store().addManualMask(manual("m2"));
    store().removeManualMask("m1");
    expect(decisions().manual.map((m) => m.key)).toEqual(["m2"]);
    store().undo();
    expect(decisions().manual.map((m) => m.key)).toEqual(["m1", "m2"]);
  });

  it("keeps reveal and the global toggle out of history", () => {
    store().setRevealed("k1", true);
    store().toggleMasks();
    expect(store().revealed).toEqual({ k1: true });
    expect(store().masksEnabled).toBe(false);
    expect(selectCanUndo(useMaskStore.getState())).toBe(false);
  });
});
