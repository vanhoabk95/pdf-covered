import { useEffect, useRef } from "react";
import { SENSITIVITY_PRESETS } from "../masking/thresholds";
import { useSettingsStore } from "../state/settingsStore";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Detection and masking settings (spec §16, §41). Stored locally; no document content. */
export function SettingsDialog({ onClose }: { onClose(): void }) {
  const s = useSettingsStore();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal settings" role="dialog" aria-labelledby="settings-title">
        <h2 id="settings-title">Settings</h2>

        <fieldset>
          <legend>Detection</legend>
          <label className="field">
            <span>
              Mask when Vietnamese confidence ≥ <strong>{pct(s.thresholds.auto)}</strong>
            </span>
            <input
              type="range"
              aria-label="Detection threshold"
              min={0.5}
              max={0.99}
              step={0.01}
              value={s.thresholds.auto}
              onChange={(e) => s.setAutoThreshold(Number(e.target.value))}
            />
            <span className="field-hint">
              High sensitivity {pct(SENSITIVITY_PRESETS.high)} · Normal {pct(SENSITIVITY_PRESETS.normal)} · Strict{" "}
              {pct(SENSITIVITY_PRESETS.strict)}
            </span>
          </label>
          <label className="field">
            <span>
              Mark as uncertain from <strong>{pct(s.thresholds.uncertain)}</strong>
            </span>
            <input
              type="range"
              aria-label="Uncertain threshold"
              min={0.3}
              max={s.thresholds.auto}
              step={0.01}
              value={s.thresholds.uncertain}
              onChange={(e) => s.setUncertainThreshold(Number(e.target.value))}
            />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={s.showUncertain} onChange={(e) => s.update({ showUncertain: e.target.checked })} />
            Show uncertain detections
          </label>
          <label className="check-row">
            <input type="checkbox" checked={s.fillUncertain} onChange={(e) => s.update({ fillUncertain: e.target.checked })} />
            Mask uncertain regions translucently instead of outlining them
          </label>
          <label className="check-row">
            <input type="checkbox" checked={s.autoDetect} onChange={(e) => s.update({ autoDetect: e.target.checked })} />
            Automatically start detection when a PDF opens
          </label>
          <label className="check-row">
            <input type="checkbox" checked={s.ocrEnabled} onChange={(e) => s.update({ ocrEnabled: e.target.checked })} />
            OCR scanned pages (pages without a text layer)
          </label>
        </fieldset>

        <fieldset>
          <legend>Masks</legend>
          <label className="field">
            <span>
              Mask opacity <strong>{pct(s.maskOpacity)}</strong>
            </span>
            <input
              type="range"
              aria-label="Mask opacity"
              min={0.5}
              max={1}
              step={0.05}
              value={s.maskOpacity}
              onChange={(e) => s.update({ maskOpacity: Number(e.target.value) })}
            />
            {s.maskOpacity < 1 && <span className="field-hint warn">Text under the mask may be partly readable.</span>}
          </label>
          <label className="field">
            <span>
              Mask padding <strong>{s.maskPadding.x} pt</strong>
            </span>
            <input
              type="range"
              aria-label="Mask padding"
              min={0}
              max={6}
              step={0.5}
              value={s.maskPadding.x}
              onChange={(e) => {
                const x = Number(e.target.value);
                s.update({ maskPadding: { x, y: x / 2 } });
              }}
            />
          </label>
        </fieldset>

        <p className="field-hint">Settings are stored on this computer. Document content and passwords are never saved.</p>
        <div className="modal-actions">
          <button className="btn" onClick={s.resetToDefaults}>
            Restore defaults
          </button>
          <button ref={closeRef} className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
