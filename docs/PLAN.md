# Plan: PDF Vietnamese Masking Viewer — CLAUDE.md + Implementation Plan

## Context
The repo `/Users/phungvanhoa/Desktop/kor-learn` is empty apart from `DESIGN.md` (an Apple-style design system: SF Pro/system-ui, one accent color #0066cc, no gradients, hairline borders). The user gave a full spec for a local desktop PDF viewer that finds Vietnamese text in a PDF's text layer, draws masks over it, lets the user correct the results, and exports a truly redacted PDF.

Deliverables:
1. `CLAUDE.md` at the repo root, so future sessions follow the architecture and rules.
2. A phased plan that ends in the MVP (spec §45, acceptance criteria AC-01…AC-12).

Decisions confirmed with the user:
- **Stack:** Tauri 2 + React + TypeScript + PDF.js. Rust is not installed yet, so installing it is step 0. Rust stays a thin shell (window, file dialogs, FS, SHA-256). All processing is TypeScript running in Web Workers.
- **Redaction:** true redaction with **MuPDF** (`mupdf` npm, the official WASM build). It removes glyphs, images, and line art under the redaction rectangles and keeps the rest of the page as vector text. **The license is AGPL-3.0.** This must be written in CLAUDE.md/README.
- **UI styling:** follow `DESIGN.md` tokens, scaled for a compact desktop app: 13–14px UI text, system-ui font, Action Blue as the only accent, hairline dividers, and no shadows on UI elements.

---

## Step 0 — Environment
- Install Rust (`rustup`) and the Xcode CLT, then check with `cargo --version`. Node 24 and pnpm 10 are already present.
- Scaffold with `pnpm create tauri-app` (React + TS + Vite template), `git init`, and pnpm as the package manager.

## Step 1 — Write `CLAUDE.md` (full contents below)

```markdown
# CLAUDE.md — Vietnamese PDF Masking Viewer

Local desktop PDF viewer: detects Vietnamese text in PDF text layers, overlays masks,
lets the user correct detections, exports a securely redacted PDF.
Full product spec: docs/SPEC.md. Visual language: DESIGN.md (adapt to compact desktop UI).

## Stack
- Tauri 2 (Rust shell: window, dialogs, FS, hashing only — no business logic in Rust)
- React 18 + TypeScript (strict) + Vite, state via Zustand (+ zundo for undo/redo)
- pdfjs-dist: rendering + text extraction (main thread render, extraction in worker)
- mupdf (WASM, AGPL-3.0): redaction export + verification, runs in a worker
- franc-min (MIT) + custom heuristics: language detection, runs in a worker
- Vitest (unit/integration, Node), Playwright (UI alignment tests against Vite dev server)

## Commands
- pnpm tauri dev        # run desktop app
- pnpm dev              # web-only dev (browser) for fast UI iteration
- pnpm test             # vitest (unit + pipeline + redaction security tests)
- pnpm test:e2e         # playwright
- pnpm typecheck && pnpm lint
- pnpm fixtures         # regenerate test-pdfs/ (scripts/make-fixtures.ts)
- pnpm tauri build

## Architecture (pipeline — keep stages as pure, separately testable modules)
PdfLoader → TextExtractor → LineGrouper → Detector(s) → RegionScorer → MaskGenerator → MaskOverlay
Export: MaskStore → RedactionEngine (mupdf) → RedactionValidator (pdfjs + mupdf text extraction)

src/
  pdf/        pdfLoader, textExtractor, coordinateTransform (ONLY place doing PDF↔viewport math)
  grouping/   lineGrouper, bbox utils
  detection/  heuristics, languageDetector (franc wrapper), vietnameseDetector, types (Detector interface)
  masking/    maskGenerator, maskStore, thresholds
  export/     redactPdf, validateRedaction
  workers/    detection.worker.ts, export.worker.ts (Comlink)
  state/      documentStore, settingsStore, historyStore
  components/ PdfViewer, PdfPage, MaskOverlay, DebugOverlay, Toolbar, DetectionSidebar, MaskInspector
  platform/   fileIO adapter (Tauri vs browser)
src-tauri/    Rust shell
test-pdfs/    fixtures (generated), tests/ integration + e2e

## Hard rules
1. Coordinates: masks/lines/items are stored in **unrotated PDF user space (points, origin
   bottom-left, relative to the page's view box)**. Never persist screen pixels. Convert only in
   coordinateTransform.ts (PDF.js viewport.convertToViewportRectangle / MuPDF page space).
2. Rendering is layered: canvas → (text layer) → mask overlay (absolutely positioned DOM/SVG).
   Toggling/editing masks must never re-render the canvas.
3. Detection is generic: implement the `Detector` interface; Vietnamese is one detector.
   MaskRegion carries `detector`, `language`, `confidence`. Don't hard-code "vi" in masking/export.
4. Detection unit = line, but keep item-level references (`itemIds`) for future word-level masks.
5. Honesty over aggression: thresholds auto ≥0.85, uncertain 0.60–0.85, below → no mask
   (configurable). Uncertain regions are NOT redacted on export unless confirmed.
6. Name-only / short Title-Case lines without Vietnamese function words are capped to "uncertain".
7. Export must use real redaction (mupdf applyRedactions) + full non-incremental save with
   garbage collection. Never "draw a black rectangle" as export. Every export runs validation;
   if any redacted source text is extractable, the export fails and the file is not written.
8. Privacy: no network calls. No analytics. CSP in tauri.conf.json blocks remote origins.
   Passwords live in memory for the document session only.
9. Logging: counts and timings only — never log document text (except in debug mode, opt-in).
10. Heavy work off the main thread; process pages by priority (current, next, prev, rest).
11. No PDF parsing / detection / coordinate math inside React components.

## Testing
- Pure functions get unit tests next to them (*.test.ts).
- tests/redaction.security.test.ts is MANDATORY and must stay green: "Mục tiêu dự án" → redact →
  export → extract text (pdfjs AND mupdf) → string absent, while English text still present.
- Fixtures are generated from scripts/make-fixtures.ts (pdf-lib + fontkit + Noto Sans subset);
  don't hand-edit PDFs in test-pdfs/.

## License note
mupdf is AGPL-3.0. The app as distributed must comply (source availability) or a commercial
Artifex license is required. Keep mupdf usage isolated in src/export/ so it can be swapped.

## UI
Follow DESIGN.md tokens: system-ui font, ink #1d1d1f, parchment #f5f5f7 app chrome, white page
canvas, single accent #0066cc, 1px hairline #e0e0e0, radius 8px utility controls, no gradients,
no chrome shadows. Auto mask = solid black; uncertain = 1.5px dashed amber outline + % label
(the one semantic exception to single-accent); ignored = hidden, shown faint in debug mode.
```

Also copy the user's spec into `docs/SPEC.md`, so CLAUDE.md can point to it.

---

## Core data model (`src/detection/types.ts`, `src/masking/types.ts`)
The spec's interfaces with these additions:
- `PdfTextItem`: add `itemIndex` and `dir` (ltr/ttb); bbox is in PDF user space, computed from `transform` + `width` + font ascent/descent.
- `TextLine`: `itemIds[]`, `bbox`, `text` (spaces inserted where the gap between items is > 0.25 × fontSize).
- `DetectionResult { detector: string; language; confidence; signals: Record<string, number> }`. `signals` feeds the debug overlay.
- `MaskRegion`: spec fields plus `detector`, `lineId?`, `itemIds?`, and `bbox` in PDF space. `status` is auto/confirmed/ignored/manual. There is also a derived `tier`: auto/uncertain/none, computed from confidence and current thresholds, **not stored**. Changing a threshold recomputes tiers without re-running detection (AC-08).
- `PdfPageState` / `PdfDocumentState` follow spec §44, plus `viewBox`, `rotate`, and `userOverrides: Map<regionKey, status>`. `regionKey` is a hash of page, rounded bbox, and text, so overrides survive re-detection.

## Phases & steps

### Phase A — Shell & viewer (spec steps 1–3)
- Scaffold Tauri 2. Add `platform/fileIO.ts`: the Tauri dialog + fs plugin, with a browser `<input type=file>` fallback. Support drag-and-drop and Ctrl/Cmd+O.
- `pdf/pdfLoader.ts`: `pdfjs.getDocument({data, password})`. Map errors to typed errors: `PasswordException` goes to a password dialog, `InvalidPDFException` gives a "corrupt" message.
- `PdfViewer`: virtualized vertical page list. Render with `IntersectionObserver` and only keep canvases for visible pages ±1. Scale uses `devicePixelRatio`. Zoom in/out, fit width, fit page, and page navigation.
- `PdfPage`: stacks the canvas, the text layer (optional, off by default), and `MaskOverlay`.

### Phase B — Extraction & grouping (steps 4–6)
- `textExtractor.ts`: `page.getTextContent()` → `PdfTextItem[]`. Skip empty or whitespace-only items. Compute bbox with `pdfjs.Util.transform`.
- `DebugOverlay` (dev only, toggled with Ctrl+Shift+D): raw item boxes, line boxes, a `VI 0.98` label, and coordinates.
- `grouping/lineGrouper.ts`: sort by baseline. Two items join the same line when all of these hold: same direction, |Δbaseline| < 0.5 × min(fontSize), font size ratio < 1.5, and horizontal gap < 1.5 × fontSize. Items stay in reading order. Handle rotated text using the angle from `transform`. Unit tests use synthetic items.
- `bbox.ts`: union, pad, intersect, normalize. Unit tests.

### Phase C — Detection (step 7), in `detection.worker.ts` via Comlink
- `heuristics.ts` returns separate signals:
  - `viCharRatio`: letters from the Vietnamese-only set (ăâđêôơư, upper and lower case, plus precomposed tone forms such as ạ ả ã ầ ẩ ẫ ậ ắ ằ ẳ ẵ ặ ẹ ẻ ẽ ề ể ễ ệ ỉ ị ọ ỏ ố ồ ổ ỗ ộ ớ ờ ở ỡ ợ ụ ủ ứ ừ ử ữ ự ỳ ỵ ỷ ỹ) divided by all letters. Apply NFC normalization first.
  - `viStopwordRatio`: share of tokens that are Vietnamese function words (và, của, cho, trong, không, được, các, một, với, người, theo, khi, từ, là, có, này, những, để, đã, sẽ, bị, lên, trước, …).
  - `viSyllableRatio`: share of tokens that are valid Vietnamese syllables. Uses a small built-in list of about 6.7k syllables, which also catches Vietnamese typed without diacritics ("kiem tra").
  - `nameLike`: ≤ 4 Title-Case tokens, the first token is a common surname (Nguyễn/Nguyen, Trần, Lê, Phạm, …) or a place name, and there are no stopwords.
- `languageDetector.ts`: wraps `franc-min` with `only: ['vie','eng','kor','jpn','cmn', …]` and turns franc's distance scores into a probability for `vie`. Lines under 10 letters get low weight.
- `vietnameseDetector.ts`: logistic combination `p = σ(w·signals + b)` with hand-tuned weights kept in one constants file. Rules:
  - One Vietnamese-only diacritic word plus any stopword → ≥ 0.9.
  - Mixed technical lines ("Kiểm tra gamma value") pass on the Vietnamese evidence of their tokens. English tokens do not subtract much.
  - `nameLike` caps the score at 0.75, so the line is uncertain at most.
  - A pure ASCII English line with no Vietnamese syllable match → < 0.2.
- Unit tests use a table of about 60 labelled lines, including every example in the spec (§2, §12, §33, §34).
- `Detector` interface: `detect(lines) → DetectionResult[]`. A registry allows future PII/regex detectors.

### Phase D — Masks & overlay (steps 8–10)
- `maskGenerator.ts`: line result + thresholds → `MaskRegion` with bbox padded in PDF points (default 2/1 pt, so padding scales with zoom). Applies user overrides by `regionKey`.
- `maskStore` (Zustand + zundo): ignore, confirm, restore, show-original (a view-only flag, not undoable), manual create/delete. Undo/redo with Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z.
- `coordinateTransform.ts`: `pdfRectToViewport(rect, viewport)` and `viewportPointToPdf(pt, viewport)`. Covers rotation 0/90/180/270 and non-zero view box origins. Unit-tested against PDF.js viewports.
- `MaskOverlay.tsx`: one absolutely positioned SVG per page, sized to the viewport CSS size. Rects are recomputed from PDF-space boxes on zoom or resize, and the canvas is not re-rendered. Clicking a mask opens `MaskInspector` (a popover with the spec §15 actions).
- Progressive scheduler (`state/processingQueue.ts`): priority queue ordered current → next → prev → rest. The current page updates it. Per-page state goes pending → extracting → detecting → ready/error. Pages show their masks as soon as they are ready.

### Phase E — Controls & sidebar (steps 11–12)
- **Toolbar:** Open, zoom controls, page `n / N`, Mask ON/OFF (Ctrl/Cmd+Shift+M), sensitivity (High 0.65 / Normal 0.85 / Strict 0.95 plus a custom slider), show-uncertain toggle, Export (Ctrl/Cmd+E).
- **DetectionSidebar:** document name; counts for Vietnamese, uncertain, and ignored regions; a per-page list with counts and a processing indicator. The results list is grouped by page with a confidence % and truncated text. Clicking an item scrolls to the region and flashes the mask.
- **Manual mask tool:** drag a rectangle, which gets `status="manual"`. This is optional MVP work, done at the end of Phase E.
- **settingsStore:** persists non-sensitive settings with `tauri-plugin-store`, falling back to localStorage.

### Phase F — Redaction export + verification (steps 13–14) — `export.worker.ts`
- `redactPdf.ts` using `mupdf`:
  1. `Document.openDocument(bytes)`. If the PDF is encrypted, authenticate with the in-memory password.
  2. For each page, for each mask with status auto (tier auto), confirmed, or manual (not ignored, not uncertain): convert the PDF user-space bbox to MuPDF page space (y flipped, with page rotation and mediabox offset applied, via a shared `pdfToMupdfRect`). Then call `page.createAnnotation("Redact").setRect(r)`.
  3. `page.applyRedactions(true /*black boxes*/, imageMethod=pixels, lineArt=remove-if-covered, text=remove)`.
  4. Remove document-level leaks: drop the XMP metadata if present, and warn that outlines/bookmarks and form-field values may contain text. For MVP, strip outlines and form fields when redactions exist, and list this in the export dialog.
  5. `doc.saveToBuffer("garbage=4,compress,clean")`. This is a full rewrite. Never use incremental save.
- `validateRedaction.ts`: re-open the output with **both** pdfjs `getTextContent` and mupdf `toStructuredText().asText()`. Normalize both (NFC, collapse whitespace, remove spaces). For each redacted `sourceText`, check that no substring of ≥ 4 normalized chars remains **inside the redacted region**. Also do a global check for the full line text. If any check fails, the export is reported unsafe and the file is not saved. The export dialog shows the result ("Verified: 42 regions, 0 leaks").
- Export dialog copy explains the difference between a visual mask and permanent redaction (spec §19). Uncertain regions are excluded unless confirmed.

### Phase G — Hardening
- Error handling for spec §39: corrupt PDF, password, unsupported encryption, pages without a text layer (flagged as "OCR candidate" with 0 text items), out-of-memory on huge pages (cap the canvas area and fall back to a lower DPI), and export failure. All errors use a toast/dialog, never a silent failure.
- In-memory cache keyed by SHA-256 (computed in Rust or with `crypto.subtle`). Persistent `masks.json` is optional and comes last.
- CSP `default-src 'self'`. No HTTP plugin enabled in Tauri capabilities (AC-12).
- Dev logging for spec §53: counts and timings only.

### Phase H (post-MVP) — OCR extension point
- Only an `OcrEngine` interface and the "OCR candidate" page flag in the MVP. PaddleOCR (sidecar) comes later, feeding `OcrTextRegion` into the same Detector → MaskGenerator path.

---

## Fixtures (`scripts/make-fixtures.ts`, pdf-lib + @pdf-lib/fontkit + Noto Sans)
english-only, vietnamese-only, mixed-en-vi (the spec §2 page), technical-mixed-language (spec §34), multi-page (10 pages), rotated-page (`/Rotate 90`, plus rotated text), password.pdf, and scanned-page (an image-only page).

## Verification
1. **Unit (Vitest):** heuristics, languageDetector, vietnameseDetector (labelled table: precision on English lines = 100%, recall on Vietnamese sentences ≥ 95%), lineGrouper, bbox, coordinateTransform (all rotations), maskGenerator, threshold tiering.
2. **Pipeline integration (Vitest, Node, pdfjs legacy build):** each fixture → masks. Asserts: mixed-en-vi masks exactly the 2 Vietnamese lines, "Project Overview" and "Target luminance: 500 nit" are not masked, and the scanned page is flagged as an OCR candidate.
3. **Redaction security (mandatory):** mixed-en-vi → redact → extract with pdfjs and mupdf → "Mục tiêu dự án" and "Người phụ trách" are absent, "Target luminance" is present. The same test also runs on rotated-page and multi-page.
4. **E2E (Playwright on `pnpm dev`):** open a fixture, then at zooms 50/100/200% and 2 window sizes, compare each mask rect's DOM box with the expected viewport rect from PDF.js (tolerance 1px). Toggle masks, ignore a region, change sensitivity and check the counts change (AC-04–AC-09).
5. **Manual check in `pnpm tauri dev`:** open a real business PDF, export, then open the result in Preview/Acrobat and try select, copy, and search on the redacted areas.
6. **Privacy:** run the app with network monitoring (Little Snitch, or check Tauri devtools Network is empty) during open, detect, and export.

## Build order summary
0 env → A viewer → B extraction + debug overlay → C detection → D masks + alignment tests → E UI/controls → F redaction + security test → G hardening. Commit at the end of each phase with tests green.
