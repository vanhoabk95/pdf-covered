import { isRedactable } from "../masking/maskGenerator";
import type { DetectionThresholds } from "../masking/thresholds";
import type { MaskRegion } from "../masking/types";
import type { PageProcessingState } from "../pipeline/processingQueue";
import type { RedactionRegion } from "./types";

export interface PageExportState {
  state: PageProcessingState;
  noTextLayer: boolean;
  ocr?: boolean;
}

export interface ExportReadiness {
  /** Every page has finished analysis (export must not miss unanalyzed content). */
  complete: boolean;
  processed: number;
  pageCount: number;
  failedPages: number[];
  /** Pages without a text layer that were not OCR'd: their content cannot be detected. */
  unanalyzedScannedPages: number[];
}

export function exportReadiness(pages: readonly PageExportState[]): ExportReadiness {
  const failedPages: number[] = [];
  const unanalyzedScannedPages: number[] = [];
  let processed = 0;
  pages.forEach((p, i) => {
    if (p.state === "ready" || p.state === "error") processed++;
    if (p.state === "error") failedPages.push(i);
    if (p.state === "ready" && p.noTextLayer && !p.ocr) unanalyzedScannedPages.push(i);
  });
  return { complete: processed === pages.length, processed, pageCount: pages.length, failedPages, unanalyzedScannedPages };
}

export interface RedactionPlan {
  regions: RedactionRegion[];
  /** Uncertain detections that will NOT be removed (spec §42). */
  excludedUncertain: number;
}

/** Regions to remove: exactly the masks shown as solid (auto, confirmed, manual). */
export function planRedaction(
  masksByPage: readonly (readonly MaskRegion[])[],
  thresholds: DetectionThresholds,
): RedactionPlan {
  const regions: RedactionRegion[] = [];
  let excludedUncertain = 0;
  for (const masks of masksByPage) {
    for (const mask of masks) {
      if (isRedactable(mask, thresholds)) {
        regions.push({ pageIndex: mask.pageIndex, bbox: mask.bbox, sourceText: mask.sourceText });
      } else if (mask.status === "auto" && mask.confidence >= thresholds.uncertain) {
        excludedUncertain++;
      }
    }
  }
  return { regions, excludedUncertain };
}

export function redactedFileName(fileName: string | null): string {
  const base = (fileName ?? "document.pdf").replace(/\.pdf$/i, "");
  return `${base}-redacted.pdf`;
}
