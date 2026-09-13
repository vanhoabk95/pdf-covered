import { useMemo } from "react";
import { resolvePageMasks } from "../masking/pageMasks";
import type { MaskRegion } from "../masking/types";
import { useDocumentStore } from "../state/documentStore";
import { selectDecisions, useMaskStore } from "../state/maskStore";
import { usePageContentStore } from "../state/pageContentStore";
import { useSettingsStore } from "../state/settingsStore";

/** Resolved masks for one page; recomputed only when that page's inputs change. */
export function usePageMasks(pageIndex: number): MaskRegion[] {
  const content = usePageContentStore((s) => s.pages[pageIndex]);
  const geometry = useDocumentStore((s) => s.geometries[pageIndex]);
  const { overrides, manual } = useMaskStore(selectDecisions);
  const revealed = useMaskStore((s) => s.revealed);
  const padding = useSettingsStore((s) => s.maskPadding);
  const thresholds = useSettingsStore((s) => s.thresholds);

  return useMemo(
    () => resolvePageMasks({ pageIndex, content, geometry, overrides, manual, revealed, padding, thresholds }),
    [pageIndex, content, geometry, overrides, manual, revealed, padding, thresholds],
  );
}
