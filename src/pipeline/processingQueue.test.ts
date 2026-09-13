import { describe, expect, it } from "vitest";
import { nextPageToProcess, type PageProcessingState } from "./processingQueue";

const pending = (n: number): PageProcessingState[] => Array(n).fill("pending");

function drain(states: PageProcessingState[], current: number): number[] {
  const order: number[] = [];
  for (let next = nextPageToProcess(states, current); next !== null; next = nextPageToProcess(states, current)) {
    order.push(next);
    states[next] = "ready";
  }
  return order;
}

describe("nextPageToProcess", () => {
  it("processes current, next, previous, then the rest in sequence", () => {
    expect(drain(pending(8), 3)).toEqual([3, 4, 2, 5, 6, 7, 0, 1]);
  });

  it("starts at the first page for a fresh document", () => {
    expect(drain(pending(4), 0)).toEqual([0, 1, 2, 3]);
  });

  it("handles the last page as current", () => {
    expect(drain(pending(4), 3)).toEqual([3, 2, 0, 1]);
  });

  it("re-prioritizes when the user jumps to another page", () => {
    const states = pending(10);
    states[0] = "ready";
    states[1] = "ready";
    expect(nextPageToProcess(states, 7)).toBe(7);
  });

  it("skips pages that are in progress, done or failed", () => {
    const states: PageProcessingState[] = ["extracting", "ready", "error", "pending"];
    expect(nextPageToProcess(states, 0)).toBe(3);
    expect(nextPageToProcess(["ready", "ready"], 0)).toBeNull();
    expect(nextPageToProcess([], 0)).toBeNull();
  });

  it("clamps an out-of-range current page", () => {
    expect(nextPageToProcess(pending(3), 99)).toBe(2);
  });
});
