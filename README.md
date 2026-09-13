# ViMask

Local desktop PDF viewer that detects Vietnamese text, masks it, and exports a permanently
redacted PDF. Works on PDFs with a text layer and on scanned (image-only) pages via offline OCR.
Everything runs on this computer — no document content is sent anywhere.

See `CLAUDE.md` for architecture and rules, `docs/PLAN.md` for the implementation plan.

## Features

- Open PDFs by dialog, drag and drop or Ctrl/Cmd+O; password-protected PDFs supported.
- Automatic Vietnamese detection per line with a confidence score (diacritic syllable analysis,
  name/place handling, franc trigram model as supporting evidence). Mixed technical lines such as
  "Kiểm tra gamma value" are recognized; names alone and text without diacritics stay "uncertain".
- OCR (Tesseract, Vietnamese + English) for pages without a text layer.
- Masks aligned in PDF coordinates at any zoom / window size; uncertain regions outlined with %.
- Click a mask: show original, confirm, ignore; manual rectangle masks; undo/redo.
- Sidebar summary, per-page counts and a results list that jumps to each region.
- Sensitivity presets (High 65% / Normal 85% / Strict 95%) and custom thresholds.
- **Export Redacted PDF**: MuPDF removes text, image pixels and line art under masks, strips
  metadata/annotations/bookmarks/forms/attachments/structure text, rewrites the file, then verifies
  with MuPDF + PDF.js text extraction and a rendering check. Nothing is saved if verification fails.

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd+O | Open PDF |
| Ctrl/Cmd+E | Export Redacted PDF |
| Ctrl/Cmd + / − | Zoom in / out |
| Ctrl/Cmd+0 | Fit page |
| Ctrl/Cmd+Shift+M | Toggle Vietnamese masks |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z | Undo / redo |
| Esc | Leave manual mask tool / close popovers |
| Ctrl/Cmd+Shift+D | Debug overlay (development builds) |

## Development

```sh
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"   # Homebrew rustup
pnpm install
pnpm tauri dev      # desktop app
pnpm dev            # browser-only UI at http://localhost:1420
pnpm test           # unit, integration, redaction security and OCR tests
pnpm test:e2e       # Playwright (Chromium)
pnpm fixtures       # regenerate test-pdfs/
pnpm tauri build    # release build
```

## Known limitations

- Detection unit is the line; a mixed line is masked as a whole (word-level masks are future work).
- OCR quality depends on scan quality; low-confidence OCR lines are only marked uncertain.
- Exported copies of password-protected PDFs are saved without a password.
- Session cache (analysis and decisions per file hash) lives in memory only.

## License note

Redaction export uses MuPDF (AGPL-3.0). Distribution must comply with AGPL or use a commercial
license. OCR uses Tesseract.js (Apache-2.0); test fonts are Noto Sans (OFL).
