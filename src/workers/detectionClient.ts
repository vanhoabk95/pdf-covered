import { runDetectors } from "../detection/registry";
import type { DetectableLine, DetectionResult } from "../detection/types";
import type { DetectionRequest, DetectionResponse } from "./detectionProtocol";

export interface DetectionClient {
  detect(lines: readonly DetectableLine[]): Promise<DetectionResult[]>;
  dispose(): void;
}

/** Runs detectors in-thread. Used in tests and when Web Workers are unavailable. */
export function createInlineDetectionClient(): DetectionClient {
  return {
    detect: async (lines) => runDetectors(lines),
    dispose: () => undefined,
  };
}

/** Runs detectors in a dedicated Web Worker; falls back to in-thread if the worker fails to start. */
export function createDetectionClient(): DetectionClient {
  if (typeof Worker === "undefined") return createInlineDetectionClient();

  let worker: Worker;
  try {
    worker = new Worker(new URL("./detection.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return createInlineDetectionClient();
  }

  let nextId = 1;
  const pending = new Map<number, { resolve(r: DetectionResult[]): void; reject(e: Error): void }>();

  worker.onmessage = (event: MessageEvent<DetectionResponse>) => {
    const msg = event.data;
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.ok) entry.resolve(msg.results);
    else entry.reject(new Error(msg.error));
  };
  worker.onerror = (event) => {
    const error = new Error(`Detection worker failed: ${event.message}`);
    pending.forEach((p) => p.reject(error));
    pending.clear();
  };

  return {
    detect(lines) {
      const id = nextId++;
      const request: DetectionRequest = { id, lines: lines.map((l) => ({ id: l.id, text: l.text })) };
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage(request);
      });
    },
    dispose() {
      worker.terminate();
      pending.forEach((p) => p.reject(new Error("Detection client disposed")));
      pending.clear();
    },
  };
}
