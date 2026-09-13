export type ShortcutAction =
  | "open"
  | "zoom-in"
  | "zoom-out"
  | "fit-page"
  | "prev-page"
  | "next-page"
  | "toggle-debug";

export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** True when focus is in a text field (plain-key shortcuts are ignored there). */
  inTextField: boolean;
}

/** Maps a key event to an app action. Ctrl on Windows, Cmd or Ctrl on macOS. */
export function resolveShortcut(e: KeyInput): ShortcutAction | null {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey) {
    const key = e.key.toLowerCase();
    if (key === "o" && !e.shiftKey) return "open";
    if (key === "d" && e.shiftKey) return "toggle-debug";
    if (key === "=" || key === "+") return "zoom-in";
    if (key === "-" || key === "_") return "zoom-out";
    if (key === "0" && !e.shiftKey) return "fit-page";
    return null;
  }
  if (e.inTextField || e.altKey || e.shiftKey) return null;
  if (e.key === "ArrowLeft") return "prev-page";
  if (e.key === "ArrowRight") return "next-page";
  return null;
}
