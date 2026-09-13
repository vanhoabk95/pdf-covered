import type { BoundingBox } from "../pdf/types";

/** Spec §13. `auto` = from a detector; `manual` = drawn by the user. */
export type MaskStatus = "auto" | "confirmed" | "ignored" | "manual";

/** User decision stored per region key; survives re-detection and threshold changes. */
export type MaskOverride = "confirmed" | "ignored";

export interface MaskRegion {
  id: string;
  /** Stable identity (page + rounded geometry + text hash), used for overrides and undo. */
  key: string;
  pageIndex: number;
  /** PDF user space (points, origin bottom-left). Already padded and clipped. */
  bbox: BoundingBox;
  sourceText: string;
  detector: string;
  language: string;
  confidence: number;
  status: MaskStatus;
  /** False while the user temporarily reveals the original ("Show original"). */
  visible: boolean;
  /** 0..1 recognition confidence when the region's text came from OCR. */
  ocrConfidence?: number;
  lineId?: string;
  itemIds?: string[];
}
