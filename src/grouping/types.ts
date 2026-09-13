import type { BoundingBox, PdfTextItem } from "../pdf/types";

/** Text items that read as one logical line. Detection runs on lines (CLAUDE.md rule 4). */
export interface TextLine {
  id: string;
  pageIndex: number;
  /** Items joined in reading order, with spaces inserted at word gaps. */
  text: string;
  /** Items in reading order; kept so future word-level masks can use item geometry. */
  items: PdfTextItem[];
  itemIds: string[];
  /** Union of item bounds, PDF user space. */
  bbox: BoundingBox;
  /** Shared text direction in degrees. */
  rotation: number;
  /** Median font size of the items. */
  fontSize: number;
}
