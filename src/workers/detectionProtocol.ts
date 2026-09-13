import type { DetectableLine, DetectionResult } from "../detection/types";

export interface DetectionRequest {
  id: number;
  lines: DetectableLine[];
}

export type DetectionResponse =
  | { id: number; ok: true; results: DetectionResult[] }
  | { id: number; ok: false; error: string };
