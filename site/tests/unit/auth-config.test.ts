import assert from "node:assert/strict";
import test from "node:test";

import { loadAuthConfig } from "../../src/auth/config";
import { AuthConfigurationError } from "../../src/auth/errors";

test("the test identity provider is forbidden outside local and test", () => {
  assert.throws(
    () =>
      loadAuthConfig({
        APP_ENV: "production",
        APP_URL: "https://nexi.example",
        AUTH_PROVIDER: "test",
        AUTH_SECURITY_PEPPER: "runtime-secret",
      }),
    AuthConfigurationError,
  );
});

test("production Supabase config uses secure host-only cookies", () => {
  const config = loadAuthConfig({
    APP_ENV: "production",
    APP_URL: "https://nexi.example",
    AUTH_PROVIDER: "supabase",
    AUTH_SECURITY_PEPPER: "runtime-secret",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "publishable-value",
    SUPABASE_SECRET_KEY: "secret-value",
  });
  assert.equal(config.cookieName, "__Host-nexi_session");
  assert.equal(config.recoveryCookieName, "__Host-nexi_recovery");
  assert.equal(config.cookieSecure, true);
  assert.equal(config.provider, "supabase");
});

test("production fails closed without the security pepper", () => {
  assert.throws(
    () =>
      loadAuthConfig({
        APP_ENV: "production",
        APP_URL: "https://nexi.example",
        AUTH_PROVIDER: "supabase",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "publishable-value",
        SUPABASE_SECRET_KEY: "secret-value",
      }),
    AuthConfigurationError,
  );
});

test("Supabase invitations fail closed without a server secret key", () => {
  assert.throws(
    () =>
      loadAuthConfig({
        APP_ENV: "production",
        APP_URL: "https://nexi.example",
        AUTH_PROVIDER: "supabase",
        AUTH_SECURITY_PEPPER: "runtime-secret",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "publishable-value",
      }),
    AuthConfigurationError,
  );
});
