import assert from "node:assert/strict";
import test from "node:test";

import { SupabaseIdentityProvider } from "../../src/auth/supabase-identity-provider.server";

const provider = new SupabaseIdentityProvider(
  "https://project.supabase.co",
  "publishable-test-value",
);
const invitationProvider = new SupabaseIdentityProvider(
  "https://project.supabase.co",
  "publishable-test-value",
  "server-secret-test-value",
);

test("Supabase adapter returns only a normalized verified identity", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      access_token: "provider-access-token",
      refresh_token: "provider-refresh-token",
      user: {
        id: "external-subject",
        email: "person@example.com",
        email_confirmed_at: "2026-07-25T10:00:00Z",
      },
    });
  try {
    const identity = await provider.authenticate({
      email: "person@example.com",
      password: "runtime-only-password",
      requireMfa: false,
    });
    assert.deepEqual(identity, {
      provider: "supabase",
      subject: "external-subject",
      email: "person@example.com",
      emailVerified: true,
      assuranceLevel: "aal1",
    });
    assert.ok(!("access_token" in identity));
    assert.ok(!("refresh_token" in identity));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Supabase adapter completes TOTP server-side before returning AAL2", async () => {
  const originalFetch = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    paths.push(new URL(url).pathname);
    if (url.includes("/token?")) {
      return Response.json({
        access_token: "temporary-aal1-token",
        user: {
          id: "staff-subject",
          email: "staff@example.com",
          email_confirmed_at: "2026-07-25T10:00:00Z",
          factors: [
            { id: "factor-id", factor_type: "totp", status: "verified" },
          ],
        },
      });
    }
    if (url.endsWith("/challenge")) {
      return Response.json({ id: "challenge-id" });
    }
    return Response.json({ access_token: "aal2-token" });
  };
  try {
    const identity = await provider.authenticate({
      email: "staff@example.com",
      password: "runtime-only-password",
      oneTimeCode: "123456",
      requireMfa: true,
    });
    assert.equal(identity.assuranceLevel, "aal2");
    assert.deepEqual(paths, [
      "/auth/v1/token",
      "/auth/v1/factors/factor-id/challenge",
      "/auth/v1/factors/factor-id/verify",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Supabase recovery keeps redirect in the allow-listed query", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedBody = "";
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedBody = String(init?.body || "");
    return Response.json({});
  };
  try {
    await provider.requestPasswordRecovery(
      "person@example.com",
      "https://nexi.example/api/auth/recovery/verify",
    );
    const url = new URL(capturedUrl);
    assert.equal(
      url.searchParams.get("redirect_to"),
      "https://nexi.example/api/auth/recovery/verify",
    );
    assert.deepEqual(JSON.parse(capturedBody), {
      email: "person@example.com",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Supabase invitation dispatch keeps the secret server-side", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedAuthorization = "";
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedAuthorization = new Headers(init?.headers).get("authorization") || "";
    return Response.json({ id: "provider-invitation-user" });
  };
  try {
    const result = await invitationProvider.sendInvitation(
      "invitee@example.com",
      "Invitada Segura",
      "https://nexi.example/invitacion/aceptar",
    );
    assert.deepEqual(result, {
      providerReference: "provider-invitation-user",
    });
    assert.equal(
      new URL(capturedUrl).searchParams.get("redirect_to"),
      "https://nexi.example/invitacion/aceptar",
    );
    assert.equal(capturedAuthorization, "Bearer server-secret-test-value");
    assert.ok(!JSON.stringify(result).includes("server-secret-test-value"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Supabase invitation acceptance returns only verified identity data", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      access_token: "one-use-provider-access-token",
      refresh_token: "provider-refresh-token",
      user: {
        id: "provider-invitation-user",
        email: "invitee@example.com",
        email_confirmed_at: "2026-07-25T10:00:00Z",
      },
    });
  try {
    const result = await provider.verifyInvitation("one-use-token-hash");
    assert.deepEqual(result, {
      providerReference: "provider-invitation-user",
      identity: {
        provider: "supabase",
        subject: "provider-invitation-user",
        email: "invitee@example.com",
        emailVerified: true,
        assuranceLevel: "aal1",
      },
    });
    assert.ok(!JSON.stringify(result).includes("access-token"));
    assert.ok(!JSON.stringify(result).includes("refresh-token"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
