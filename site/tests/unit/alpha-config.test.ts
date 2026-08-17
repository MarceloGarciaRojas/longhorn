import assert from "node:assert/strict";
import test from "node:test";

import { AlphaConfigurationError, loadAlphaConfig } from "../../src/alpha/config";

const VALID_ALPHA = {
  APP_ENV: "alpha",
  APP_URL: "https://nexi-alpha.example",
  SITE_DELETION_GRACE_HOURS: "48",
  ALPHA_RESOURCE_GUARD: "nexi-alpha",
  ALPHA_DEPLOY_TARGET: "cloudflare-workers",
  AUTH_PROVIDER: "supabase",
  AUTH_SECURITY_PEPPER: "a-secure-fixture-with-at-least-32-characters",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "publishable-fixture",
  SUPABASE_SECRET_KEY: "secret-fixture",
  MEDIA_STORAGE_PROVIDER: "supabase",
  MEDIA_SUPABASE_BUCKET: "nexi-alpha-media",
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  CLOUDFLARE_HYPERDRIVE_ID: "b".repeat(32),
  DATABASE_ADMIN_URL:
    "postgresql://postgres:secret@db.example/postgres?sslmode=require",
  DATABASE_MIGRATION_URL:
    "postgresql://nexi_migrator.project:secret@db.example/postgres?sslmode=require",
  DATABASE_URL:
    "postgresql://nexi_app.project:secret@db.example/postgres?sslmode=require",
} as const;

test("alpha preflight accepts only the explicit persistent stack", () => {
  const config = loadAlphaConfig(VALID_ALPHA);
  assert.equal(config.environment, "alpha");
  assert.equal(config.mediaBucket, "nexi-alpha-media");
});

test("alpha preflight cannot run from CI or with test credentials", () => {
  assert.throws(
    () => loadAlphaConfig({ ...VALID_ALPHA, CI: "true" }),
    AlphaConfigurationError,
  );
  assert.throws(
    () =>
      loadAlphaConfig({
        ...VALID_ALPHA,
        TEST_DATABASE_URL:
          "postgresql://nexi_app:secret@db.example/test?sslmode=require",
      }),
    /must not coexist/,
  );
});

test("alpha preflight rejects weak or mixed provider configuration", () => {
  assert.throws(
    () => loadAlphaConfig({ ...VALID_ALPHA, AUTH_SECURITY_PEPPER: "short" }),
    /at least 32/,
  );
  assert.throws(
    () => loadAlphaConfig({ ...VALID_ALPHA, MEDIA_STORAGE_PROVIDER: "local" }),
    /forbidden/,
  );
});
