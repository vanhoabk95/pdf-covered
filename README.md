# ViMask

Local desktop PDF viewer that detects Vietnamese text and masks it, with secure redacted export.
All processing happens on-device.

See `CLAUDE.md` for architecture and rules, `docs/PLAN.md` for the implementation plan.

## Development

```sh
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"   # Homebrew rustup
pnpm install
pnpm tauri dev      # desktop app
pnpm dev            # browser-only UI at http://localhost:1420
pnpm test           # unit + integration
pnpm test:e2e       # Playwright
```

## License note

Redaction export uses MuPDF (AGPL-3.0). Distribution must comply with AGPL or use a commercial license.
