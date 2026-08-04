import assert from "node:assert/strict";
import test from "node:test";

import { loadAuthConfig } from "../../src/auth/config";
import {
  hasTrustedOrigin,
  normalizeEmail,
  openRecoveryGrant,
  sealRecoveryGrant,
} from "../../src/auth/security";

const config = loadAuthConfig({
  APP_ENV: "test",
  APP_URL: "http://localhost:3000",
  AUTH_PROVIDER: "test",
  AUTH_SECURITY_PEPPER: "ephemeral-test-pepper",
});

test("email normalization is strict and deterministic", () => {
  assert.equal(normalizeEmail("  PERSON@Example.COM "), "person@example.com");
  assert.equal(normalizeEmail("not-an-email"), null);
});

test("POST origin must match the canonical application origin", () => {
  assert.equal(
    hasTrustedOrigin(
      new Request("http://localhost:3000/action", {
        headers: { origin: "http://localhost:3000" },
      }),
      config,
    ),
    true,
  );
  assert.equal(
    hasTrustedOrigin(
      new Request("http://localhost:3000/action", {
        headers: { origin: "https://attacker.invalid" },
      }),
      config,
    ),
    false,
  );
});

test("recovery grants are encrypted, authenticated and expire-safe", () => {
  const sealed = sealRecoveryGrant(config, {
    accessToken: "sensitive-provider-token",
    nonce: "one-time-recovery-nonce",
    identity: {
      provider: "test",
      subject: "test-client-a",
      email: "ana.demo@example.invalid",
      emailVerified: true,
      assuranceLevel: "aal1",
    },
  });
  assert.ok(!sealed.includes("sensitive-provider-token"));
  assert.equal(openRecoveryGrant(config, sealed)?.identity.subject, "test-client-a");
  const middle = Math.floor(sealed.length / 2);
  const tampered = `${sealed.slice(0, middle)}${
    sealed[middle] === "a" ? "b" : "a"
  }${sealed.slice(middle + 1)}`;
  assert.equal(openRecoveryGrant(config, tampered), null);
});
