// Copies PDF.js runtime assets (CMaps, standard fonts, wasm decoders, ICC profiles)
// into public/pdfjs so they are served locally. No CDN: documents never leave the machine.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("pdfjs-dist/package.json"));
const outDir = join(import.meta.dirname, "..", "public", "pdfjs");

mkdirSync(outDir, { recursive: true });
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  cpSync(join(pkgDir, dir), join(outDir, dir), { recursive: true });
}
console.log(`pdfjs assets copied to ${outDir}`);
