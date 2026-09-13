import { useMemo } from "react";
import { effectiveTier } from "../masking/maskGenerator";
import { resolvePageMasks } from "../masking/pageMasks";
import type { ConfidenceTier } from "../masking/thresholds";
import type { MaskRegion } from "../masking/types";
import { useDocumentStore } from "../state/documentStore";
import { selectDecisions, useMaskStore } from "../state/maskStore";
import { usePageContentStore } from "../state/pageContentStore";
import { useSettingsStore } from "../state/settingsStore";

export interface ResolvedMask {
  mask: MaskRegion;
  tier: ConfidenceTier;
}

export interface DocumentMaskSummary {
  byPage: ResolvedMask[][];
  vietnamese: number;
  uncertain: number;
  ignored: number;
  manual: number;
}

/** All pages' masks with tiers, for the sidebar and export. */
export function useDocumentMasks(): DocumentMaskSummary {
  const pages = usePageContentStore((s) => s.pages);
  const geometries = useDocumentStore((s) => s.geometries);
  const { overrides, manual } = useMaskStore(selectDecisions);
  const revealed = useMaskStore((s) => s.revealed);
  const padding = useSettingsStore((s) => s.maskPadding);
  const thresholds = useSettingsStore((s) => s.thresholds);

  return useMemo(() => {
    const summary: DocumentMaskSummary = { byPage: [], vietnamese: 0, uncertain: 0, ignored: 0, manual: 0 };
    pages.forEach((content, pageIndex) => {
      const masks = resolvePageMasks({
        pageIndex,
        content,
        geometry: geometries[pageIndex],
        overrides,
        manual,
        revealed,
        padding,
        thresholds,
      }).map((mask) => ({ mask, tier: effectiveTier(mask, thresholds) }));
      for (const { mask, tier } of masks) {
        if (mask.status === "manual") summary.manual++;
        else if (mask.status === "ignored") {
          if (mask.confidence >= thresholds.uncertain) summary.ignored++;
        } else if (tier === "auto") summary.vietnamese++;
        else if (tier === "uncertain") summary.uncertain++;
      }
      summary.byPage.push(masks);
    });
    return summary;
  }, [pages, geometries, overrides, manual, revealed, padding, thresholds]);
}
