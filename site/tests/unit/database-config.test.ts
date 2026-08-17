import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeResetTarget,
  DatabaseConfigError,
  readDatabaseUrl,
} from "../../src/db/config";

test("database URLs are required only when a database command asks for them", () => {
  assert.throws(
    () => readDatabaseUrl("application", {}),
    (error: unknown) =>
      error instanceof DatabaseConfigError &&
      error.variableName === "DATABASE_URL" &&
      !error.message.includes("password"),
  );
});

test("database URL validation accepts PostgreSQL without exposing its value", () => {
  const value =
    "postgresql://nexi_app:local-only@127.0.0.1:54329/nexi_test";
  assert.equal(readDatabaseUrl("test", { TEST_DATABASE_URL: value }), value);

  assert.throws(
    () => readDatabaseUrl("test", { TEST_DATABASE_URL: "https://example.com" }),
    (error: unknown) =>
      error instanceof DatabaseConfigError &&
      error.variableName === "TEST_DATABASE_URL" &&
      !error.message.includes("example.com"),
  );
});

test("database reset is restricted to local/test databases", () => {
  assert.doesNotThrow(() =>
    assertSafeResetTarget(
      "postgresql://role:local@127.0.0.1:54329/nexi_test",
      { APP_ENV: "test" },
    ),
  );
  assert.throws(() =>
    assertSafeResetTarget(
      "postgresql://role:secret@database.example.com:5432/nexi",
      { APP_ENV: "production" },
    ),
  );
});

test("alpha database URLs require TLS, remote hosts and least-privilege roles", () => {
  const valid =
    "postgresql://nexi_app.project-ref:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require";
  assert.equal(
    readDatabaseUrl("application", { APP_ENV: "alpha", DATABASE_URL: valid }),
    valid,
  );
  assert.throws(
    () =>
      readDatabaseUrl("application", {
        APP_ENV: "alpha",
        DATABASE_URL: "postgresql://nexi_app:secret@db.example/postgres",
      }),
    /sslmode/,
  );
  assert.throws(
    () =>
      readDatabaseUrl("application", {
        APP_ENV: "alpha",
        DATABASE_URL:
          "postgresql://postgres:secret@db.example/postgres?sslmode=require",
      }),
    /restricted application database role/,
  );
  assert.throws(
    () =>
      readDatabaseUrl("test", {
        APP_ENV: "alpha",
        TEST_DATABASE_URL: valid,
      }),
    /forbidden in alpha/,
  );
});
