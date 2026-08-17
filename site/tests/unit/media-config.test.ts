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

test("alpha requires persistent Supabase storage and rejects local storage", () => {
  assert.throws(
    () => loadMediaConfig({ APP_ENV: "alpha" }),
    /requires the persistent supabase provider/,
  );
  assert.throws(
    () => loadMediaConfig({ APP_ENV: "alpha", MEDIA_STORAGE_PROVIDER: "local" }),
    /forbidden/,
  );
  const config = loadMediaConfig({
    APP_ENV: "alpha",
    MEDIA_STORAGE_PROVIDER: "supabase",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SECRET_KEY: "secret-value",
    MEDIA_SUPABASE_BUCKET: "nexi-alpha-media",
  });
  assert.equal(config.provider, "supabase");
  assert.equal(config.supabaseBucket, "nexi-alpha-media");
  assert.equal(config.localServiceUrl, undefined);
});
