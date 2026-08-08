import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the nexi prototype", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>nexi \| Gestión digital clara para pymes<\/title>/i);
  assert.match(html, /nexi-wordmark\.png/);
  assert.match(html, /Menos complejidad/);
  assert.match(html, /ALCANCE MVP/);
  assert.match(html, /tres plantillas/);
  assert.doesNotMatch(html, /Guía visual|Sistema visual/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("keeps the landing and dynamic public resolver explicit and responsive", async () => {
  const [page, landing, css, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/landing-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(landing, /href="\/ingresar"/);
  assert.doesNotMatch(landing, /cualquier correo y contraseña/);
  assert.doesNotMatch(landing, /nexi-interno/);
  assert.match(landing, /href="\/comenzar"/);
  assert.doesNotMatch(landing, /Cafetería de barrio/);
  assert.match(page, /resolvePublicSite/);
  assert.match(page, /renderRegisteredTemplate/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(layout, /lang="es"/);
});
