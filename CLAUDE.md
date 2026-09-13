# CLAUDE.md — Vietnamese PDF Masking Viewer

Local desktop PDF viewer: detects Vietnamese text in PDF text layers, overlays masks,
lets the user correct detections, exports a securely redacted PDF.
Product spec: docs/SPEC.md. Implementation plan: docs/PLAN.md.
Visual language: DESIGN.md (adapt to a compact desktop UI).

## Stack
- Tauri 2 (Rust shell: window, dialogs, FS, hashing only — no business logic in Rust)
- React 19 + TypeScript (strict) + Vite 8, state via Zustand (+ zundo for undo/redo)
- pdfjs-dist 6: rendering + text extraction. v6 notes: no `convertToViewportRectangle`
  (use our coordinateTransform), dispose docs via `destroyPdf()` (`doc.loadingTask.destroy()`),
  render with `page.render({ canvas, viewport })`. Runtime assets (cmaps, fonts, wasm) are copied
  to `public/pdfjs` by `scripts/copy-pdfjs-assets.mjs` (predev/prebuild) — never load from a CDN.
- mupdf (WASM, AGPL-3.0): redaction export + verification, runs in a worker
- franc-min (MIT) + custom heuristics: language detection, runs in `workers/detection.worker.ts`
- Vitest (unit/integration, Node), Playwright (UI alignment tests against Vite dev server)

## Commands
Rust comes from Homebrew `rustup`; its proxies are not on PATH by default:
`export PATH="/opt/homebrew/opt/rustup/bin:$PATH"` before cargo/tauri commands.
- pnpm tauri dev        # run desktop app
- pnpm dev              # web-only dev (browser) for fast UI iteration
- pnpm test             # vitest (unit + pipeline + redaction security tests)
- pnpm test:e2e         # playwright
- pnpm typecheck          # (no linter configured yet)
- pnpm fixtures         # regenerate test-pdfs/ (scripts/make-fixtures.ts)
- pnpm tauri build

## Architecture (pipeline — keep stages as pure, separately testable modules)
PdfLoader → TextExtractor → LineGrouper → Detector(s) → MaskGenerator → MaskOverlay
Orchestrated by `pipeline/documentProcessor.ts` (one page at a time, priority from
`pipeline/processingQueue.ts`), results in `state/pageContentStore.ts`.
Extraction calls `page.getTextContent()` from the main thread — PDF.js already parses in its own
worker; our CPU work (grouping, detection) is what moves to `workers/` when it gets heavy.
Export: MaskStore → RedactionEngine (mupdf) → RedactionValidator (pdfjs + mupdf text extraction)

```
src/
  pdf/        pdfLoader, textExtractor, coordinateTransform (ONLY place doing PDF↔viewport math)
  grouping/   lineGrouper (angle bucket → baseline band → split at gaps), bbox utils
  pipeline/   documentProcessor, processingQueue
  detection/  syllables (Vietnamese onset+rhyme+tone validator), heuristics (signals, names),
              languageDetector (franc, supporting evidence only), vietnameseDetector (weights),
              registry (ACTIVE_DETECTORS), labelledLines (evaluation sets), types (LineDetector)
  masking/    thresholds, maskGenerator (pad + clip), pageMasks (resolve with decisions), history (undo)
  export/     redactPdf, validateRedaction
  workers/    detection.worker.ts + detectionClient (plain postMessage RPC, inline fallback), export.worker.ts
  state/      documentStore, viewerStore, pageContentStore, maskStore (decisions + undo), settingsStore, debugStore
  components/ PdfViewer, PdfPage, MaskOverlay, MaskInspector, DebugOverlay/Panel, Toolbar, Sidebar
  platform/   fileIO adapter (Tauri vs browser)
src-tauri/    Rust shell
test-pdfs/    generated fixtures
tests/        integration + e2e
```

## Hard rules
1. Coordinates: items/lines/masks are stored in **unrotated PDF user space** (points, origin
   bottom-left, relative to the page view box). Never persist screen pixels. Convert only in
   `coordinateTransform.ts` (PDF.js viewport ↔ PDF space ↔ MuPDF page space).
2. Rendering is layered: canvas → (optional text layer) → mask overlay (absolutely positioned SVG).
   Toggling/editing masks must never re-render the canvas.
3. Detection is generic: implement the `Detector` interface; Vietnamese is one detector.
   `MaskRegion` carries `detector`, `language`, `confidence`. Don't hard-code "vi" in masking/export.
4. Detection unit = line, but keep item-level references (`itemIds`) for future word-level masks.
5. Honesty over aggression: auto ≥ 0.85, uncertain 0.60–0.85, below → no mask (configurable).
   Tier is derived from confidence + current thresholds, not stored. Uncertain regions are NOT
   redacted on export unless confirmed.
6. Name-only / short Title-Case lines without Vietnamese function words are capped to "uncertain".
7. Export uses real redaction (mupdf `applyRedactions`) + full, non-incremental save with garbage
   collection. Never "draw a black rectangle" as export. Every export runs validation; if any
   redacted source text is extractable, the export fails and no file is written.
8. Privacy: no network calls, no analytics. CSP in tauri.conf.json blocks remote origins.
   Passwords live in memory for the document session only.
9. Logging: counts and timings only — never log document text (debug mode is opt-in).
10. Heavy work off the main thread; process pages by priority (current, next, prev, rest).
11. No PDF parsing / detection / coordinate math inside React components.

## Vietnamese detection
- Main evidence = diacritic tokens that are *valid Vietnamese syllables* and not part of a
  person/place name. franc is unreliable on short/mixed lines ("Kiểm tra gamma value" → por),
  so it only nudges the score. Text without diacritics is capped at 0.78 (never auto-masked);
  name-only lines are capped at 0.70.
- Weights live in `WEIGHTS` (vietnameseDetector.ts). Any change must keep
  `LABELLED_LINES` and `HOLDOUT_LINES` green; add new failure cases to `LABELLED_LINES` first.
  Don't tune against `HOLDOUT_LINES`.

## Masking
- Masks are *derived*: `resolvePageMasks(content, overrides, manual, revealed, thresholds)`.
  Only user decisions are stored (maskStore): overrides by `regionKey` (page + rounded line bbox
  + text hash), manual masks, reveal flags. Undo covers overrides + manual masks only.
- Clipping: masks are clipped only against lines that stay *visible* (not auto/confirmed). Protect
  a visible neighbour's baseline→cap-height band; its descenders may be covered so Vietnamese
  diacritics stay hidden. If glyph bands truly overlap (very tight leading), split at the midpoint.
- `isRedactable` = effective tier "auto" (confirmed/manual included, uncertain excluded, ignored
  excluded). Phase F export must use exactly this predicate.
- `tests/e2e/masking.spec.ts` measures canvas ink: >99% of Vietnamese-line ink under solid masks,
  <1% of other lines' ink, across zoom levels and window sizes.

## Testing
- Pure functions get unit tests next to them (`*.test.ts`). Node tests alias `pdfjs-dist` to the
  legacy build (vite.config.ts). `tests/helpers/makePdf.ts` builds in-memory PDFs.
- `tests/pdfLoader.test.ts` cross-checks our viewport transform against PDF.js for every rotation,
  offset MediaBox and UserUnit — keep it passing when touching coordinate math.
- E2E (`tests/e2e`, Playwright, Vite dev server): open files via the file chooser, assert on
  `.pdf-page[data-page-index]` / `.mask-layer[data-page-index]` boxes.
- `tests/redaction.security.test.ts` is MANDATORY and must stay green: "Mục tiêu dự án" → redact →
  export → extract text (pdfjs AND mupdf) → string absent, while English text is still present.
- Fixtures: defined in `tests/helpers/fixtures.ts` with per-line ground truth (`vi: boolean`),
  built in-memory by tests and written to `test-pdfs/` by `pnpm fixtures`. Don't hand-edit PDFs.
  Fonts in `tests/fonts` are pre-subset Noto Sans (Latin + Vietnamese). Embed with
  `{ subset: false, features: { ccmp: false } }`: pdf-lib subsetting corrupts rendering, and ccmp
  decomposition breaks ToUnicode ("Mục" → "Muc"). Draw NFC text.
- Text from PDFs is cleaned in `cleanText` (strip control chars, NFC). Never compare raw strings.
- Debug overlay (spec §55): dev builds only, Ctrl/Cmd+Shift+D. `tests/e2e/extraction.spec.ts`
  checks that ≥99% of rendered ink lies inside extracted line boxes — the alignment guard.
- Never paste literal control characters into source; use `\uXXXX` escapes.

## License note
mupdf is AGPL-3.0. Distribution must comply (source availability) or a commercial Artifex
license is required. Keep mupdf usage isolated in `src/export/` so it can be swapped.

## UI
Follow DESIGN.md tokens: system-ui font, 13–14px UI text, ink #1d1d1f, parchment #f5f5f7 app
chrome, white page canvas, single accent #0066cc, 1px hairline #e0e0e0, 8px radius for utility
controls, no gradients, no chrome shadows. Auto mask = solid black; uncertain = 1.5px dashed amber
outline + % label (the one semantic exception to the single accent); ignored = hidden (faint in
debug mode).
