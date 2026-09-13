// Copies Tesseract.js runtime assets into public/tesseract so OCR works fully offline:
//   worker.min.js, LSTM core builds (plain / SIMD / relaxed SIMD) and vie+eng language data.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const outDir = join(import.meta.dirname, "..", "public", "tesseract");
const tesseractDir = dirname(require.resolve("tesseract.js/package.json"));
const coreDir = dirname(createRequire(join(tesseractDir, "package.json")).resolve("tesseract.js-core/package.json"));

mkdirSync(join(outDir, "core"), { recursive: true });
mkdirSync(join(outDir, "lang"), { recursive: true });

copyFileSync(join(tesseractDir, "dist", "worker.min.js"), join(outDir, "worker.min.js"));
for (const variant of ["tesseract-core-lstm", "tesseract-core-simd-lstm", "tesseract-core-relaxedsimd-lstm"]) {
  for (const ext of [".js", ".wasm.js"]) {
    const src = join(coreDir, variant + ext);
    if (existsSync(src)) copyFileSync(src, join(outDir, "core", variant + ext));
  }
}
for (const lang of ["vie", "eng"]) {
  const pkg = dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`));
  copyFileSync(join(pkg, "4.0.0_best_int", `${lang}.traineddata.gz`), join(outDir, "lang", `${lang}.traineddata.gz`));
}
console.log(`tesseract assets copied to ${outDir}`);
