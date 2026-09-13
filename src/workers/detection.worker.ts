/// <reference lib="webworker" />
import { runDetectors } from "../detection/registry";
import type { DetectionRequest, DetectionResponse } from "./detectionProtocol";

// Language detection off the main thread (CLAUDE.md rule 10). Receives text only, no geometry.
self.onmessage = (event: MessageEvent<DetectionRequest>) => {
  const { id, lines } = event.data;
  let response: DetectionResponse;
  try {
    response = { id, ok: true, results: runDetectors(lines) };
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(response);
};
