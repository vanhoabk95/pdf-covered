// Browser-only PDF.js bootstrap. Imported once from main.tsx.
import { GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { setPdfAssetOptions } from "./pdfLoader";

GlobalWorkerOptions.workerSrc = workerUrl;

// Served from public/pdfjs (copied by scripts/copy-pdfjs-assets.mjs).
const base = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).toString();
setPdfAssetOptions({
  cMapUrl: `${base}cmaps/`,
  standardFontDataUrl: `${base}standard_fonts/`,
  wasmUrl: `${base}wasm/`,
  iccUrl: `${base}iccs/`,
});
