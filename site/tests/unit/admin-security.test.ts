import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isValidSlug,
  normalizeSearch,
  normalizeSlug,
} from "../../src/admin/validation";

test("tenant slugs are deterministic and reserved names fail closed", () => {
  assert.equal(normalizeSlug("  Árbol & Compañía  "), "arbol-compania");
  assert.equal(isValidSlug("arbol-compania"), true);
  assert.equal(isValidSlug("admin"), false);
  assert.equal(isValidSlug("nexi"), false);
  assert.equal(isValidSlug("a"), false);
});

test("admin search removes wildcard and control characters", () => {
  assert.equal(normalizeSearch("  Cliente%_\u0000  "), "Cliente");
  assert.equal(normalizeSearch("   "), null);
});

test("web admin repositories never open migration or administrator roles", async () => {
  const repository = await readFile(
    new URL("../../src/admin/admin-repository.server.ts", import.meta.url),
    "utf8",
  );
  const http = await readFile(
    new URL("../../src/admin/http.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(repository, /withApplicationDatabase/);
  assert.doesNotMatch(repository, /DATABASE_MIGRATION_URL|DATABASE_ADMIN_URL|BYPASSRLS/);
  assert.doesNotMatch(http, /SUPABASE_SECRET_KEY|DATABASE_MIGRATION_URL|DATABASE_ADMIN_URL/);
});
