// Regenerates test-pdfs/*.pdf from tests/helpers/fixtures.ts. Run: pnpm fixtures
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildFixture, listFixtures } from "../tests/helpers/fixtures.ts";

const outDir = join(import.meta.dirname, "..", "test-pdfs");
mkdirSync(outDir, { recursive: true });

for (const fixture of listFixtures()) {
  const bytes = await buildFixture(fixture);
  writeFileSync(join(outDir, `${fixture.name}.pdf`), bytes);
  console.log(`${fixture.name}.pdf  ${(bytes.byteLength / 1024).toFixed(1)} KB`);
}
