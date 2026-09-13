import { useEffect } from "react";
import { useDocumentStore } from "../state/documentStore";
import { selectDecisions, useMaskStore } from "../state/maskStore";
import { getCachedDecisions, storeDecisions } from "../state/sessionCache";

/**
 * Keeps user decisions (ignored / confirmed regions, manual masks) per document for the session:
 * reopening the same file restores them; opening another file starts clean.
 */
export function useSessionDecisions(): void {
  const documentHash = useDocumentStore((s) => s.documentHash);

  useEffect(() => {
    const masks = useMaskStore.getState();
    masks.reset();
    if (!documentHash) return;
    const cached = getCachedDecisions(documentHash);
    if (cached) masks.restoreDecisions(cached);
    const unsubscribe = useMaskStore.subscribe((state) => storeDecisions(documentHash, selectDecisions(state)));
    return unsubscribe;
  }, [documentHash]);
}
