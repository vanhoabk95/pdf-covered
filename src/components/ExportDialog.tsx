import { useEffect, useMemo, useRef, useState } from "react";
import { useDocumentMasks } from "../app/useDocumentMasks";
import { log } from "../app/log";
import { exportRedactedPdf, type ExportOutcome, type ExportStage } from "../export/exportDocument";
import { exportReadiness, planRedaction, redactedFileName } from "../export/plan";
import { ExportError, type ValidationReport } from "../export/types";
import { fileNameFromPath, pickSavePath, writePdf } from "../platform/fileIO";
import { getSessionPassword, useDocumentStore } from "../state/documentStore";
import { usePageContentStore } from "../state/pageContentStore";
import { useSettingsStore } from "../state/settingsStore";

type Phase =
  | { kind: "review" }
  | { kind: "working"; stage: ExportStage }
  | { kind: "done"; outcome: ExportOutcome; savedAs: string }
  | { kind: "failed"; message: string; validation?: ValidationReport };

const STAGE_LABEL: Record<ExportStage, string> = {
  redacting: "Removing hidden content…",
  verifying: "Verifying that removed text cannot be extracted…",
  saving: "Saving…",
};

/** Export Redacted PDF (spec §19–§21). Visual masks become permanent removals. */
export function ExportDialog({ onClose }: { onClose(): void }) {
  const fileName = useDocumentStore((s) => s.fileName);
  const bytes = useDocumentStore((s) => s.bytes);
  const pages = usePageContentStore((s) => s.pages);
  const started = usePageContentStore((s) => s.started);
  const thresholds = useSettingsStore((s) => s.thresholds);
  const { byPage } = useDocumentMasks();
  const [phase, setPhase] = useState<Phase>({ kind: "review" });
  const [acknowledged, setAcknowledged] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const readiness = useMemo(() => exportReadiness(pages), [pages]);
  const plan = useMemo(() => planRedaction(byPage.map((p) => p.map((m) => m.mask)), thresholds), [byPage, thresholds]);
  const pageList = (indices: number[]) => indices.map((i) => i + 1).join(", ");
  const busy = phase.kind === "working";

  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const blocked =
    !started ||
    !readiness.complete ||
    readiness.failedPages.length > 0 ||
    (readiness.unanalyzedScannedPages.length > 0 && !acknowledged);

  const runExport = async () => {
    if (!bytes || blocked) return;
    const target = await pickSavePath(redactedFileName(fileName));
    if (!target) return;
    try {
      const outcome = await exportRedactedPdf(
        { bytes, password: getSessionPassword(), regions: plan.regions },
        (stage) => setPhase({ kind: "working", stage }),
      );
      setPhase({ kind: "working", stage: "saving" });
      await writePdf(target, outcome.bytes);
      setPhase({ kind: "done", outcome, savedAs: target });
    } catch (err) {
      log.error("export failed", err);
      const validation = (err as { validation?: ValidationReport }).validation;
      const message =
        err instanceof ExportError
          ? err.message
          : `Export failed: ${err instanceof Error ? err.message : String(err)}. No file was saved.`;
      setPhase({ kind: "failed", message, validation });
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal export" role="dialog" aria-labelledby="export-title">
        <h2 id="export-title">Export Redacted PDF</h2>

        {phase.kind === "review" && (
          <>
            <div className="export-explain">
              <p>
                <strong>Hide Vietnamese</strong> is a temporary visual mask — the original text stays in the PDF.
              </p>
              <p>
                <strong>Export Redacted PDF</strong> creates a new file in which the masked content is permanently removed
                and cannot be selected, copied, searched or extracted.
              </p>
            </div>

            <dl className="summary export-summary">
              <dt>Regions to remove</dt>
              <dd data-testid="export-regions">{plan.regions.length}</dd>
              <dt>Pages affected</dt>
              <dd>{new Set(plan.regions.map((r) => r.pageIndex)).size}</dd>
              {plan.excludedUncertain > 0 && (
                <>
                  <dt>Uncertain regions not removed</dt>
                  <dd data-testid="export-excluded">{plan.excludedUncertain}</dd>
                </>
              )}
            </dl>
            {plan.excludedUncertain > 0 && (
              <p className="field-hint">Confirm uncertain regions (click them) to include them in the export.</p>
            )}

            {!started && <p className="export-warning">Run detection before exporting.</p>}
            {started && !readiness.complete && (
              <p className="export-warning" role="status">
                Waiting for analysis to finish ({readiness.processed}/{readiness.pageCount} pages)…
              </p>
            )}
            {readiness.failedPages.length > 0 && (
              <p className="export-warning error">
                Page {pageList(readiness.failedPages)} could not be analyzed. Export is blocked to avoid leaking content.
              </p>
            )}
            {readiness.unanalyzedScannedPages.length > 0 && (
              <label className="check-row export-warning">
                <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                <span>
                  Page {pageList(readiness.unanalyzedScannedPages)} {readiness.unanalyzedScannedPages.length === 1 ? "has" : "have"} no
                  text layer and {readiness.unanalyzedScannedPages.length === 1 ? "was" : "were"} not scanned with OCR. Content there
                  is only removed where you drew manual masks. I understand.
                </span>
              </label>
            )}

            <p className="field-hint">
              The export also removes document metadata, bookmarks, annotations, form fields, attachments and embedded
              structure text. A password-protected original is saved without its password.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
              <button ref={primaryRef} className="btn btn-primary" disabled={blocked || !bytes} onClick={runExport}>
                Export…
              </button>
            </div>
          </>
        )}

        {phase.kind === "working" && (
          <div className="export-progress" role="status" aria-live="polite">
            <span className="page-status spinner" aria-hidden />
            {STAGE_LABEL[phase.stage]}
          </div>
        )}

        {phase.kind === "done" && (
          <>
            <p className="export-success" role="status">
              Redacted PDF saved and verified.
            </p>
            <dl className="summary export-summary">
              <dt>Saved as</dt>
              <dd title={phase.savedAs}>{fileNameFromPath(phase.savedAs)}</dd>
              <dt>Regions removed</dt>
              <dd data-testid="export-removed">{phase.outcome.report.redactedRegions}</dd>
              <dt>Verification</dt>
              <dd data-testid="export-verified">
                {phase.outcome.validation.checkedRegions} regions, {phase.outcome.validation.leaks.length} leaks
              </dd>
            </dl>
            <p className="field-hint">Checked with MuPDF and PDF.js text extraction and a rendering check.</p>
            <div className="modal-actions">
              <button ref={primaryRef} className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}

        {phase.kind === "failed" && (
          <>
            <p className="export-warning error" role="alert">
              {phase.message}
            </p>
            {phase.validation && (
              <ul className="leak-list">
                {phase.validation.leaks.slice(0, 5).map((leak, i) => (
                  <li key={i}>
                    Page {leak.pageIndex + 1}: {leak.detail} ({leak.engine})
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>
                Close
              </button>
              <button ref={primaryRef} className="btn btn-primary" onClick={() => setPhase({ kind: "review" })}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
