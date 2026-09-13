/** Minimal undo/redo stack over immutable snapshots (spec §37). */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const HISTORY_LIMIT = 200;

export function createHistory<T>(initial: T): History<T> {
  return { past: [], present: initial, future: [] };
}

export function pushHistory<T>(history: History<T>, next: T): History<T> {
  if (Object.is(next, history.present)) return history;
  const past = [...history.past, history.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [] };
}

export function undoHistory<T>(history: History<T>): History<T> {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redoHistory<T>(history: History<T>): History<T> {
  if (!history.future.length) return history;
  const [next, ...future] = history.future;
  return { past: [...history.past, history.present], present: next, future };
}
