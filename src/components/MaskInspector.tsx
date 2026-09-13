import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { effectiveTier } from "../masking/maskGenerator";
import { resolvePageMasks } from "../masking/pageMasks";
import { useDocumentStore } from "../state/documentStore";
import { selectDecisions, useMaskStore } from "../state/maskStore";
import { usePageContentStore } from "../state/pageContentStore";
import { useSettingsStore } from "../state/settingsStore";

const SNIPPET_LENGTH = 80;

/** Popover for one mask (spec §15): show original, ignore, confirm, delete. */
export function MaskInspector() {
  const inspector = useMaskStore((s) => s.inspector);
  const decisions = useMaskStore(selectDecisions);
  const revealed = useMaskStore((s) => s.revealed);
  const { setOverride, setRevealed, removeManualMask, closeInspector } = useMaskStore.getState();
  const content = usePageContentStore((s) => (inspector ? s.pages[inspector.pageIndex] : undefined));
  const geometry = useDocumentStore((s) => (inspector ? s.geometries[inspector.pageIndex] : undefined));
  const thresholds = useSettingsStore((s) => s.thresholds);
  const padding = useSettingsStore((s) => s.maskPadding);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const mask = useMemo(() => {
    if (!inspector) return undefined;
    return resolvePageMasks({
      pageIndex: inspector.pageIndex,
      content,
      geometry,
      overrides: decisions.overrides,
      manual: decisions.manual,
      revealed,
      padding,
      thresholds,
    }).find((m) => m.key === inspector.key);
  }, [inspector, content, geometry, decisions, revealed, padding, thresholds]);

  // Close on Escape, outside click, or scroll.
  useEffect(() => {
    if (!inspector) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeInspector();
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeInspector();
    };
    const onScroll = () => closeInspector();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    document.querySelector(".viewer-scroll")?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
      document.querySelector(".viewer-scroll")?.removeEventListener("scroll", onScroll);
    };
  }, [inspector, closeInspector]);

  // Keep the popover inside the window.
  useLayoutEffect(() => {
    if (!inspector || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    const margin = 8;
    setPosition({
      left: Math.min(Math.max(margin, inspector.anchor.x + margin), window.innerWidth - width - margin),
      top: Math.min(Math.max(margin, inspector.anchor.y + margin), window.innerHeight - height - margin),
    });
  }, [inspector, mask]);

  useEffect(() => {
    if (inspector && !mask) closeInspector();
  }, [inspector, mask, closeInspector]);

  if (!inspector || !mask) return null;

  const tier = effectiveTier(mask, thresholds);
  const percent = Math.round(mask.confidence * 100);
  const isManual = mask.status === "manual";
  const title = isManual
    ? "Manual mask"
    : mask.status === "confirmed"
      ? "Confirmed Vietnamese"
      : tier === "uncertain"
        ? "Possibly Vietnamese"
        : "Vietnamese text";
  const snippet =
    mask.sourceText.length > SNIPPET_LENGTH ? `${mask.sourceText.slice(0, SNIPPET_LENGTH)}…` : mask.sourceText;

  const act = (fn: () => void) => () => {
    fn();
    closeInspector();
  };

  return (
    <div
      ref={ref}
      className="inspector"
      role="dialog"
      aria-label="Mask inspector"
      style={position ? { left: position.left, top: position.top } : { visibility: "hidden" }}
    >
      <div className="inspector-header">
        <span className="inspector-title">{title}</span>
        {!isManual && <span className={`inspector-badge tier-${tier}`}>{percent}%</span>}
      </div>
      {!isManual && snippet && !mask.visible && <p className="inspector-snippet">{snippet}</p>}
      <div className="inspector-actions">
        {tier === "auto" &&
          (mask.visible ? (
            <button onClick={act(() => setRevealed(mask.key, true))}>Show original</button>
          ) : (
            <button onClick={act(() => setRevealed(mask.key, false))}>Hide again</button>
          ))}
        {!isManual && mask.status !== "confirmed" && (
          <button onClick={act(() => setOverride(mask.key, "confirmed"))}>Confirm Vietnamese</button>
        )}
        {!isManual && mask.status === "confirmed" && (
          <button onClick={act(() => setOverride(mask.key, null))}>Undo confirmation</button>
        )}
        {!isManual && (
          <button
            className="danger"
            onClick={act(() => {
              setRevealed(mask.key, false);
              setOverride(mask.key, "ignored");
            })}
          >
            Ignore this region
          </button>
        )}
        {isManual && (
          <button className="danger" onClick={act(() => removeManualMask(mask.key))}>
            Delete mask
          </button>
        )}
      </div>
      <p className="inspector-note">Visual mask only — export creates a permanently redacted copy.</p>
    </div>
  );
}
