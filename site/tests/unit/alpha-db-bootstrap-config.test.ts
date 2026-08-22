import assert from "node:assert/strict";
import test from "node:test";

import { loadAlphaConfig } from "../../src/alpha/config";
import {
  ALPHA_DATABASE_PROVISIONED_MESSAGE,
  ALPHA_DATABASE_PROVISIONING_SQL,
  loadAlphaDatabaseBootstrapConfig,
} from "../../src/alpha/db-bootstrap-config";

const PROJECT_REF = "abcdefghijklmnopqrst";
const APP_PASSWORD = "alpha-app-password-fixture-123456789";
const MIGRATOR_PASSWORD = "alpha-migrator-password-fixture-12345";
const BOOTSTRAP_ENV = {
  APP_ENV: "alpha",
  ALPHA_RESOURCE_GUARD: "nexi-alpha",
  SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
  DATABASE_ADMIN_URL:
    `postgresql://postgres.${PROJECT_REF}:secret@aws-0-sa-east-1.pooler.supabase.com/postgres?sslmode=require`,
  ALPHA_APP_DB_PASSWORD: APP_PASSWORD,
  ALPHA_MIGRATOR_DB_PASSWORD: MIGRATOR_PASSWORD,
} as const;

test("Alpha DB bootstrap needs no Hyperdrive or restricted role URLs", () => {
  const config = loadAlphaDatabaseBootstrapConfig(BOOTSTRAP_ENV);
  assert.equal(config.environment, "alpha");
  assert.equal(config.resourceGuard, "nexi-alpha");
  assert.equal(config.applicationPassword, APP_PASSWORD);
  assert.equal(config.migratorPassword, MIGRATOR_PASSWORD);
});

test("Alpha DB bootstrap rejects missing or unsafe administrative targets", () => {
  assert.throws(
    () =>
      loadAlphaDatabaseBootstrapConfig({
        ...BOOTSTRAP_ENV,
        DATABASE_ADMIN_URL: undefined,
      }),
    /DATABASE_ADMIN_URL: it is required/,
  );
  assert.throws(
    () =>
      loadAlphaDatabaseBootstrapConfig({
        ...BOOTSTRAP_ENV,
        DATABASE_ADMIN_URL:
          "postgresql://postgres:secret@127.0.0.1/nexi_test?sslmode=require",
      }),
    /remote PostgreSQL target/,
  );
  assert.throws(
    () =>
      loadAlphaDatabaseBootstrapConfig({
        ...BOOTSTRAP_ENV,
        DATABASE_ADMIN_URL:
          `postgresql://postgres.${PROJECT_REF}:secret@aws-0-sa-east-1.pooler.supabase.com/postgres`,
      }),
    /requires sslmode/,
  );
  assert.throws(
    () =>
      loadAlphaDatabaseBootstrapConfig({
        ...BOOTSTRAP_ENV,
        DATABASE_ADMIN_URL:
          "postgresql://postgres:secret@db.example/postgres?sslmode=require",
      }),
    /must match the Supabase project/,
  );
});

test("Alpha DB bootstrap fails outside Alpha and with test credentials", () => {
  assert.throws(
    () => loadAlphaDatabaseBootstrapConfig({ ...BOOTSTRAP_ENV, APP_ENV: "local" }),
    /APP_ENV: expected alpha/,
  );
  assert.throws(
    () =>
      loadAlphaDatabaseBootstrapConfig({
        ...BOOTSTRAP_ENV,
        TEST_DATABASE_URL:
          "postgresql://nexi_app:secret@127.0.0.1/nexi_test",
      }),
    /test credentials must not coexist/,
  );
});

test("Alpha DB bootstrap errors never expose role passwords", () => {
  assert.doesNotMatch(ALPHA_DATABASE_PROVISIONED_MESSAGE, new RegExp(APP_PASSWORD));
  assert.doesNotMatch(
    ALPHA_DATABASE_PROVISIONED_MESSAGE,
    new RegExp(MIGRATOR_PASSWORD),
  );
  assert.throws(
    () =>
      loadAlphaDatabaseBootstrapConfig({
        ...BOOTSTRAP_ENV,
        ALPHA_MIGRATOR_DB_PASSWORD: APP_PASSWORD,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, new RegExp(APP_PASSWORD));
      assert.doesNotMatch(error.message, new RegExp(MIGRATOR_PASSWORD));
      return true;
    },
  );
});

test("Alpha DB provisioning grants only the required database CREATE privilege", () => {
  assert.match(
    ALPHA_DATABASE_PROVISIONING_SQL,
    /GRANT CONNECT, TEMPORARY, CREATE ON DATABASE %I TO nexi_migrator/,
  );
  assert.match(
    ALPHA_DATABASE_PROVISIONING_SQL,
    /GRANT CONNECT ON DATABASE %I TO nexi_app/,
  );
  assert.match(
    ALPHA_DATABASE_PROVISIONING_SQL,
    /REVOKE CREATE ON DATABASE %I FROM nexi_app/,
  );
  assert.doesNotMatch(
    ALPHA_DATABASE_PROVISIONING_SQL,
    /GRANT[^'\n]*CREATE[^'\n]*TO nexi_app/i,
  );
  assert.match(
    ALPHA_DATABASE_PROVISIONING_SQL,
    /CREATE ROLE nexi_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE\s+NOINHERIT NOBYPASSRLS/,
  );
  assert.match(
    ALPHA_DATABASE_PROVISIONING_SQL,
    /CREATE ROLE nexi_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE\s+NOINHERIT NOBYPASSRLS/,
  );
  assert.doesNotMatch(ALPHA_DATABASE_PROVISIONING_SQL, /\bGRANT\s+SUPERUSER\b/i);
  assert.doesNotMatch(ALPHA_DATABASE_PROVISIONING_SQL, /\bGRANT\s+CREATEDB\b/i);
  assert.doesNotMatch(ALPHA_DATABASE_PROVISIONING_SQL, /\bGRANT\s+CREATEROLE\b/i);
  assert.doesNotMatch(ALPHA_DATABASE_PROVISIONING_SQL, /\bGRANT\s+BYPASSRLS\b/i);
  assert.doesNotMatch(ALPHA_DATABASE_PROVISIONING_SQL, /GRANT\s+nexi_migrator\s+TO\s+nexi_app/i);
});

test("Alpha DB privilege provisioning remains scoped and idempotent", () => {
  assert.equal(
    (ALPHA_DATABASE_PROVISIONING_SQL.match(/current_database\(\)/g) ?? []).length,
    3,
  );
  assert.equal(
    (ALPHA_DATABASE_PROVISIONING_SQL.match(/IF NOT EXISTS/g) ?? []).length,
    2,
  );
  assert.doesNotMatch(ALPHA_DATABASE_PROVISIONING_SQL, /\bDROP\s+(?:ROLE|DATABASE)\b/i);
  assert.doesNotMatch(ALPHA_DATABASE_PROVISIONING_SQL, new RegExp(APP_PASSWORD));
  assert.doesNotMatch(ALPHA_DATABASE_PROVISIONING_SQL, new RegExp(MIGRATOR_PASSWORD));
});

test("full Alpha config remains strict after DB bootstrap", () => {
  assert.throws(() => loadAlphaConfig(BOOTSTRAP_ENV), /ALPHA_DEPLOY_TARGET/);

  const completeWithoutRuntimeDatabaseUrls = {
    ...BOOTSTRAP_ENV,
    ALPHA_DEPLOY_TARGET: "cloudflare-workers",
    APP_URL: "https://nexi-alpha.example",
    SITE_DELETION_GRACE_HOURS: "48",
    AUTH_PROVIDER: "supabase",
    AUTH_SECURITY_PEPPER: "fixture-alpha-security-pepper-123456789",
    SUPABASE_PUBLISHABLE_KEY: "publishable-fixture",
    SUPABASE_SECRET_KEY: "secret-fixture",
    MEDIA_STORAGE_PROVIDER: "supabase",
    MEDIA_SUPABASE_BUCKET: "nexi-alpha-media",
    CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
    CLOUDFLARE_HYPERDRIVE_ID: "b".repeat(32),
    CLOUDFLARE_HYPERDRIVE_CACHING: "disabled",
  } as const;

  assert.throws(
    () =>
      loadAlphaConfig({
        ...BOOTSTRAP_ENV,
        ALPHA_DEPLOY_TARGET: "cloudflare-workers",
        APP_URL: "https://nexi-alpha.example",
        SITE_DELETION_GRACE_HOURS: "48",
        AUTH_PROVIDER: "supabase",
        AUTH_SECURITY_PEPPER: "fixture-alpha-security-pepper-123456789",
        SUPABASE_PUBLISHABLE_KEY: "publishable-fixture",
        SUPABASE_SECRET_KEY: "secret-fixture",
        MEDIA_STORAGE_PROVIDER: "supabase",
        MEDIA_SUPABASE_BUCKET: "nexi-alpha-media",
        CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
      }),
    /CLOUDFLARE_HYPERDRIVE_ID/,
  );
  assert.throws(
    () => loadAlphaConfig(completeWithoutRuntimeDatabaseUrls),
    /DATABASE_MIGRATION_URL/,
  );
  assert.throws(
    () =>
      loadAlphaConfig({
        ...completeWithoutRuntimeDatabaseUrls,
        DATABASE_MIGRATION_URL:
          "postgresql://nexi_migrator.project:secret@db.example/postgres?sslmode=require",
      }),
    /DATABASE_URL/,
  );
});
