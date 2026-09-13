import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export interface OpenedFile {
  name: string;
  bytes: Uint8Array;
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export async function readPdfFromPath(path: string): Promise<OpenedFile> {
  const buffer = await invoke<ArrayBuffer>("read_pdf_file", { path });
  return { name: fileNameFromPath(path), bytes: new Uint8Array(buffer) };
}

export async function readPdfFromFile(file: File): Promise<OpenedFile> {
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

/** Shows the platform "Open PDF" dialog. Resolves null when cancelled. */
export async function pickPdf(): Promise<OpenedFile | null> {
  if (isTauri()) {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    return typeof path === "string" ? readPdfFromPath(path) : null;
  }
  return pickPdfInBrowser();
}

function pickPdfInBrowser(): Promise<OpenedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      readPdfFromFile(file).then(resolve, reject);
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/**
 * Subscribes to files dropped on the window. In Tauri the native webview handles drops
 * (HTML5 drop events don't carry paths), in the browser we use DOM events.
 */
export async function onPdfDrop(
  handler: (file: Promise<OpenedFile>) => void,
  onHover: (hovering: boolean) => void,
): Promise<() => void> {
  if (isTauri()) {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    return getCurrentWebview().onDragDropEvent((event) => {
      const p = event.payload;
      if (p.type === "enter" || p.type === "over") onHover(true);
      else if (p.type === "leave") onHover(false);
      else if (p.type === "drop") {
        onHover(false);
        const pdf = p.paths.find((path) => path.toLowerCase().endsWith(".pdf"));
        if (pdf) handler(readPdfFromPath(pdf));
      }
    });
  }

  const over = (e: DragEvent) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    onHover(true);
  };
  const leave = (e: DragEvent) => {
    if (e.relatedTarget === null) onHover(false);
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    onHover(false);
    const file = Array.from(e.dataTransfer?.files ?? []).find(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (file) handler(readPdfFromFile(file));
  };
  window.addEventListener("dragover", over);
  window.addEventListener("dragleave", leave);
  window.addEventListener("drop", drop);
  return () => {
    window.removeEventListener("dragover", over);
    window.removeEventListener("dragleave", leave);
    window.removeEventListener("drop", drop);
  };
}

/** Asks where to save the redacted PDF. Resolves null when cancelled. In the browser, returns the name. */
export async function pickSavePath(defaultName: string): Promise<string | null> {
  if (!isTauri()) return defaultName;
  const path = await save({ defaultPath: defaultName, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (!path) return null;
  return /\.pdf$/i.test(path) ? path : `${path}.pdf`;
}

/** Writes an exported PDF. Tauri: raw bytes to the chosen path. Browser (dev): triggers a download. */
export async function writePdf(pathOrName: string, bytes: Uint8Array): Promise<void> {
  if (isTauri()) {
    await invoke("write_pdf_file", bytes, { headers: { "x-path": encodeURIComponent(pathOrName) } });
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileNameFromPath(pathOrName);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
