import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the gym site aligned with the Longhorn experience", async () => {
  const [page, css, layout] = await Promise.all([
    readFile(new URL("../app/gimnasio/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/gimnasio/gimnasio.css", import.meta.url), "utf8"),
    readFile(new URL("../app/gimnasio/layout.tsx", import.meta.url), "utf8"),
  ]);

  for (const feature of ["login", "onboarding", "video", "dashboard", "design"]) {
    assert.match(page, new RegExp(`\\"${feature}\\"`));
  }
  assert.match(page, /Fuerza Norte/);
  assert.match(page, /Clases/);
  assert.match(page, /Socios/);
  assert.match(page, /Modo demostración/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(layout, /Entrena con propósito/);
});
