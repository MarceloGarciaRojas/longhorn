import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ClientValidationError,
  parsePersonalProfile,
} from "../../src/client-portal/validation";

test("client forms reject role, tenant and identity fields", () => {
  for (const forbiddenField of [
    "role",
    "tenant_id",
    "status",
    "provider_subject",
    "email",
  ]) {
    const form = new FormData();
    form.set("action", "personal_profile_update");
    form.set("display_name", "Cuenta Ficticia");
    form.set("phone", "");
    form.set("locale", "es-CL");
    form.set("profile_version", "1");
    form.set(forbiddenField, "forbidden");
    assert.throws(
      () => parsePersonalProfile(form),
      (error: unknown) =>
        error instanceof ClientValidationError && error.code === "forbidden",
    );
  }
});

test("client repository never opens administrator or migration connections", async () => {
  const source = await readFile(
    new URL(
      "../../src/client-portal/client-repository.server.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /DATABASE_(?:ADMIN|MIGRATION)_URL/);
  assert.doesNotMatch(source, /readDatabaseUrl\(["'](?:admin|migration)["']\)/);
});

test("client UI does not expose internal administration or technical vocabulary", async () => {
  const files = [
    "../../app/cuenta/client-shell.tsx",
    "../../app/cuenta/page.tsx",
    "../../app/cuenta/sitios/page.tsx",
    "../../app/cuenta/plan/page.tsx",
    "../../app/cuenta/datos/page.tsx",
    "../../app/cuenta/mensajes/page.tsx",
  ];
  const source = (
    await Promise.all(
      files.map((file) => readFile(new URL(file, import.meta.url), "utf8")),
    )
  ).join("\n");
  assert.doesNotMatch(
    source,
    /Longhorn|tenant_id|Row Level Security|\bUUID\b|\bAAL\b/i,
  );
  assert.doesNotMatch(source, /\/nexi-interno|Auditoría global|Invitaciones/);
  assert.doesNotMatch(source, /Flow|checkout|datos de tarjeta/i);
});
