import assert from "node:assert/strict";
import test from "node:test";
import { loadMediaConfig, MediaConfigurationError } from "../../src/media/config";

test("local media configuration is bounded and loopback-only", () => {
  const config = loadMediaConfig({
    APP_ENV: "test",
    MEDIA_STORAGE_PROVIDER: "local",
    MEDIA_LOCAL_SERVICE_URL: "http://127.0.0.1:43127",
  });
  assert.equal(config.provider, "local");
  assert.equal(config.uploadMaxBytes, 10 * 1024 * 1024);
  assert.throws(
    () => loadMediaConfig({
      APP_ENV: "test",
      MEDIA_STORAGE_PROVIDER: "local",
      MEDIA_LOCAL_SERVICE_URL: "https://media.example.test",
    }),
    MediaConfigurationError,
  );
});

test("local provider is fail-closed in staging and production", () => {
  for (const APP_ENV of ["staging", "production"]) {
    assert.throws(
      () => loadMediaConfig({ APP_ENV, MEDIA_STORAGE_PROVIDER: "local" }),
      /forbidden/,
    );
    assert.equal(loadMediaConfig({ APP_ENV }).provider, "unconfigured");
  }
});
