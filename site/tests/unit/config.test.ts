import assert from "node:assert/strict";
import test from "node:test";

import {
  AppConfigError,
  loadAppConfig,
} from "../../src/config/app-config";

test("loads safe defaults for local development", () => {
  const config = loadAppConfig({});

  assert.equal(config.applicationName, "nexi");
  assert.equal(config.serviceName, "nexi-web");
  assert.equal(config.environment, "local");
  assert.equal(config.publicUrl, "http://localhost:3000");
  assert.equal(config.logLevel, "info");
});

test("loads an explicit production configuration", () => {
  const config = loadAppConfig({
    APP_ENV: "production",
    APP_URL: "https://nexi.example/",
    APP_VERSION: "1.2.3",
    APP_COMMIT_SHA: "abc123",
    LOG_LEVEL: "warn",
    SITE_DELETION_GRACE_HOURS: "48",
  });

  assert.equal(config.environment, "production");
  assert.equal(config.publicUrl, "https://nexi.example");
  assert.equal(config.version, "1.2.3");
  assert.equal(config.commitSha, "abc123");
  assert.equal(config.logLevel, "warn");
});

test("alpha requires an explicit HTTPS URL and deletion grace", () => {
  assert.throws(
    () =>
      loadAppConfig({
        APP_ENV: "alpha",
        APP_URL: "http://nexi-alpha.example",
        SITE_DELETION_GRACE_HOURS: "48",
      }),
    AppConfigError,
  );
  const config = loadAppConfig({
    APP_ENV: "alpha",
    APP_URL: "https://nexi-alpha.example/",
    SITE_DELETION_GRACE_HOURS: "48",
  });
  assert.equal(config.environment, "alpha");
  assert.equal(config.publicUrl, "https://nexi-alpha.example");
});

test("rejects a missing production URL without exposing values", () => {
  assert.throws(
    () => loadAppConfig({ APP_ENV: "production" }),
    (error: unknown) => {
      assert.ok(error instanceof AppConfigError);
      assert.equal(error.variableName, "APP_URL");
      assert.match(error.message, /required in production/);
      return true;
    },
  );
});

test("requires an explicit deletion grace in staging and production", () => {
  assert.throws(
    () =>
      loadAppConfig({
        APP_ENV: "production",
        APP_URL: "https://nexi.example",
      }),
    (error: unknown) => {
      assert.ok(error instanceof AppConfigError);
      assert.equal(error.variableName, "SITE_DELETION_GRACE_HOURS");
      return true;
    },
  );
  assert.equal(
    loadAppConfig({
      APP_ENV: "staging",
      APP_URL: "https://staging.nexi.example",
      SITE_DELETION_GRACE_HOURS: "24",
    }).siteDeletionGraceHours,
    24,
  );
});

test("rejects unsupported environments and log levels", () => {
  assert.throws(
    () => loadAppConfig({ APP_ENV: "preview" }),
    AppConfigError,
  );
  assert.throws(
    () => loadAppConfig({ LOG_LEVEL: "verbose" }),
    AppConfigError,
  );
});
