import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { readDatabaseUrl } from "../../src/db/config";
import { createDatabasePool } from "../../src/db/pool";
import {
  handleLogin,
  handleLogout,
  handlePasswordRecovery,
  handlePasswordReset,
  handleRecoveryVerification,
  handleTenantSelection,
} from "../../src/auth/http.server";
import {
  consumeAuthRateLimit,
  listAuthTenants,
  readAuthSession,
  resolveLinkedIdentity,
} from "../../src/auth/auth-repository.server";
import { hashSessionToken } from "../../src/auth/security";
import {
  createAuthenticatedRequestContext,
  withAuthenticatedTenantDatabase,
} from "../../src/auth/request-context.server";
import { getCurrentTenant } from "../../src/db/tenant-repository";
import { SYNTHETIC_DATA } from "../../scripts/db/seed";

const clientPassword = randomBytes(24).toString("base64url");
const adminPassword = randomBytes(24).toString("base64url");
const multiPassword = randomBytes(24).toString("base64url");
const adminTotp = "735194";
const recoveryToken = randomBytes(24).toString("base64url");

process.env.APP_ENV = "test";
process.env.APP_URL = "http://localhost:3000";
process.env.AUTH_PROVIDER = "test";
process.env.AUTH_SECURITY_PEPPER = randomBytes(32).toString("base64url");
process.env.AUTH_TEST_RECOVERY_TOKEN = recoveryToken;
process.env.AUTH_TEST_IDENTITIES = JSON.stringify([
  {
    email: SYNTHETIC_DATA.userA.email,
    password: clientPassword,
    subject: SYNTHETIC_DATA.identityA.providerSubject,
  },
  {
    email: SYNTHETIC_DATA.userAdmin.email,
    password: adminPassword,
    subject: SYNTHETIC_DATA.identityAdmin.providerSubject,
    oneTimeCode: adminTotp,
  },
  {
    email: SYNTHETIC_DATA.userMulti.email,
    password: multiPassword,
    subject: SYNTHETIC_DATA.identityMulti.providerSubject,
  },
]);

function formRequest(
  path: string,
  fields: Record<string, string>,
  cookie?: string,
  origin = "http://localhost:3000",
): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "nexi-auth-integration-test",
      "x-forwarded-for": "127.0.0.42",
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(fields),
  });
}

function responseLocation(response: Response): string {
  return new URL(response.headers.get("location")!).pathname +
    new URL(response.headers.get("location")!).search;
}

function extractCookie(response: Response, name: string): string {
  const header = response.headers.get("set-cookie") || "";
  const match = new RegExp(`${name}=([^;]+)`).exec(header);
  assert.ok(match, `expected ${name} cookie in ${header}`);
  return `${name}=${match[1]}`;
}

test.before(async () => {
  const pool = createDatabasePool({
    connectionString: readDatabaseUrl("migration"),
    applicationName: "nexi-auth-test-cleanup",
    maxConnections: 1,
  });
  try {
    await pool.query(
      "TRUNCATE public.auth_sessions, public.auth_audit_events, public.auth_rate_limits RESTART IDENTITY",
    );
  } finally {
    await pool.end();
  }
});

test("client login creates an opaque server session and logout revokes it", async () => {
  const response = await handleLogin(
    formRequest("/api/auth/login", {
      audience: "client_admin",
      email: SYNTHETIC_DATA.userA.email,
      password: clientPassword,
    }),
  );
  assert.equal(response.status, 303);
  assert.equal(responseLocation(response), "/cuenta");
  const cookie = extractCookie(response, "nexi_session");
  const token = cookie.split("=")[1];
  const setCookie = response.headers.get("set-cookie")!;
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.ok(!setCookie.includes(SYNTHETIC_DATA.userA.email));

  const session = await readAuthSession(hashSessionToken(token));
  assert.equal(session?.userId, SYNTHETIC_DATA.userA.id);
  assert.equal(session?.audience, "client_admin");
  assert.equal(session?.activeTenantId, SYNTHETIC_DATA.tenantA.id);

  const logout = await handleLogout(
    formRequest("/api/auth/logout", {}, cookie),
  );
  assert.equal(logout.status, 303);
  assert.equal(await readAuthSession(hashSessionToken(token)), null);
});

test("unknown account and wrong password expose the same public result", async () => {
  const wrongPassword = await handleLogin(
    formRequest("/api/auth/login", {
      audience: "client_admin",
      email: SYNTHETIC_DATA.userA.email,
      password: `${clientPassword}-wrong`,
    }),
  );
  const unknownAccount = await handleLogin(
    formRequest("/api/auth/login", {
      audience: "client_admin",
      email: "unknown@example.invalid",
      password: clientPassword,
    }),
  );
  assert.equal(responseLocation(wrongPassword), "/ingresar?error=invalid");
  assert.equal(responseLocation(unknownAccount), "/ingresar?error=invalid");
});

test("internal access requires both staff assignment and AAL2", async () => {
  const missingMfa = await handleLogin(
    formRequest("/api/auth/login", {
      audience: "nexi_admin",
      email: SYNTHETIC_DATA.userAdmin.email,
      password: adminPassword,
    }),
  );
  assert.equal(responseLocation(missingMfa), "/nexi-interno/ingresar?error=mfa");

  const response = await handleLogin(
    formRequest("/api/auth/login", {
      audience: "nexi_admin",
      email: SYNTHETIC_DATA.userAdmin.email,
      password: adminPassword,
      one_time_code: adminTotp,
    }),
  );
  assert.equal(responseLocation(response), "/nexi-interno");
  const cookie = extractCookie(response, "nexi_session");
  const session = await readAuthSession(
    hashSessionToken(cookie.split("=")[1]),
  );
  assert.equal(session?.audience, "nexi_admin");
  assert.equal(session?.assuranceLevel, "aal2");
  assert.equal(session?.activeTenantId, null);
});

test("an authenticated identity without tenant membership is not a client admin", async () => {
  const response = await handleLogin(
    formRequest("/api/auth/login", {
      audience: "client_admin",
      email: SYNTHETIC_DATA.userAdmin.email,
      password: adminPassword,
    }),
  );
  assert.equal(responseLocation(response), "/ingresar?error=invalid");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("tenant selection is validated server-side and cannot cross tenants", async () => {
  const login = await handleLogin(
    formRequest("/api/auth/login", {
      audience: "client_admin",
      email: SYNTHETIC_DATA.userA.email,
      password: clientPassword,
    }),
  );
  const cookie = extractCookie(login, "nexi_session");
  const response = await handleTenantSelection(
    formRequest(
      "/api/auth/select-tenant",
      { tenant_id: SYNTHETIC_DATA.tenantB.id },
      cookie,
    ),
  );
  assert.equal(
    responseLocation(response),
    "/seleccionar-empresa?error=invalid",
  );
});

test("a multi-tenant client selects only a membership returned by the server", async () => {
  const login = await handleLogin(
    formRequest("/api/auth/login", {
      audience: "client_admin",
      email: SYNTHETIC_DATA.userMulti.email,
      password: multiPassword,
    }),
  );
  assert.equal(responseLocation(login), "/seleccionar-empresa");
  const tenants = await listAuthTenants(SYNTHETIC_DATA.userMulti.id);
  assert.deepEqual(
    new Set(tenants.map((tenant) => tenant.tenantId)),
    new Set([SYNTHETIC_DATA.tenantA.id, SYNTHETIC_DATA.tenantB.id]),
  );
  const oldCookie = extractCookie(login, "nexi_session");
  const selected = await handleTenantSelection(
    formRequest(
      "/api/auth/select-tenant",
      { tenant_id: SYNTHETIC_DATA.tenantA.id },
      oldCookie,
    ),
  );
  assert.equal(responseLocation(selected), "/cuenta");
  const newCookie = extractCookie(selected, "nexi_session");
  const newSession = await readAuthSession(
    hashSessionToken(newCookie.split("=")[1]),
  );
  assert.equal(newSession?.activeTenantId, SYNTHETIC_DATA.tenantA.id);
  assert.equal(
    await readAuthSession(hashSessionToken(oldCookie.split("=")[1])),
    null,
  );

  const rejected = await handleTenantSelection(
    formRequest(
      "/api/auth/select-tenant",
      { tenant_id: SYNTHETIC_DATA.tenantC.id },
      newCookie,
    ),
  );
  assert.equal(
    responseLocation(rejected),
    "/seleccionar-empresa?error=invalid",
  );
});

test("cross-origin login is rejected before credentials are processed", async () => {
  const response = await handleLogin(
    formRequest(
      "/api/auth/login",
      {
        audience: "client_admin",
        email: SYNTHETIC_DATA.userA.email,
        password: clientPassword,
      },
      undefined,
      "https://attacker.invalid",
    ),
  );
  assert.equal(responseLocation(response), "/ingresar?error=request");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("password recovery is generic, one-time and revokes active sessions", async () => {
  const login = await handleLogin(
    formRequest("/api/auth/login", {
      audience: "client_admin",
      email: SYNTHETIC_DATA.userA.email,
      password: clientPassword,
    }),
  );
  const sessionCookie = extractCookie(login, "nexi_session");
  const sessionToken = sessionCookie.split("=")[1];

  const requested = await handlePasswordRecovery(
    formRequest("/api/auth/recovery", {
      email: SYNTHETIC_DATA.userA.email,
      redirect_to: "https://attacker.invalid/reset",
    }),
  );
  assert.equal(responseLocation(requested), "/recuperar-clave?sent=1");
  const unknownRequested = await handlePasswordRecovery(
    formRequest("/api/auth/recovery", {
      email: "unknown-recovery@example.invalid",
    }),
  );
  assert.equal(
    responseLocation(unknownRequested),
    "/recuperar-clave?sent=1",
  );

  const verified = await handleRecoveryVerification(
    new Request(
      `http://localhost:3000/api/auth/recovery/verify?token_hash=${recoveryToken}`,
    ),
  );
  assert.equal(responseLocation(verified), "/restablecer-clave");
  const recoveryCookie = extractCookie(verified, "nexi_recovery");
  assert.ok(!recoveryCookie.includes(recoveryToken));

  const completed = await handlePasswordReset(
    formRequest(
      "/api/auth/recovery/complete",
      {
        password: "a-new-synthetic-password",
        password_confirmation: "a-new-synthetic-password",
      },
      recoveryCookie,
    ),
  );
  assert.equal(responseLocation(completed), "/ingresar?reset=1");
  assert.equal(await readAuthSession(hashSessionToken(sessionToken)), null);

  const replayed = await handlePasswordReset(
    formRequest(
      "/api/auth/recovery/complete",
      {
        password: "a-new-synthetic-password",
        password_confirmation: "a-new-synthetic-password",
      },
      recoveryCookie,
    ),
  );
  assert.equal(
    responseLocation(replayed),
    "/restablecer-clave?error=invalid",
  );
});

test("identity links do not contain or require an application password", async () => {
  const linked = await resolveLinkedIdentity({
    provider: "test",
    subject: SYNTHETIC_DATA.identityA.providerSubject,
    email: SYNTHETIC_DATA.userA.email,
    emailVerified: true,
    assuranceLevel: "aal1",
  });
  assert.equal(linked?.userId, SYNTHETIC_DATA.userA.id);
});

test("changing a client role or membership revokes existing sessions", async () => {
  const login = await handleLogin(
    formRequest("/api/auth/login", {
      audience: "client_admin",
      email: SYNTHETIC_DATA.userA.email,
      password: clientPassword,
    }),
  );
  const token = extractCookie(login, "nexi_session").split("=")[1];
  const pool = createDatabasePool({
    connectionString: readDatabaseUrl("migration"),
    applicationName: "nexi-membership-revocation-test",
    maxConnections: 1,
  });
  try {
    await pool.query(
      "UPDATE public.tenant_memberships SET status = 'disabled' WHERE id = $1",
      [SYNTHETIC_DATA.membershipA.id],
    );
    assert.equal(await readAuthSession(hashSessionToken(token)), null);
    await pool.query(
      "UPDATE public.tenant_memberships SET status = 'active' WHERE id = $1",
      [SYNTHETIC_DATA.membershipA.id],
    );
  } finally {
    await pool.end();
  }
});

test("a disabled user cannot log in and an existing session fails closed", async () => {
  const login = await handleLogin(
    formRequest("/api/auth/login", {
      audience: "client_admin",
      email: SYNTHETIC_DATA.userA.email,
      password: clientPassword,
    }),
  );
  const token = extractCookie(login, "nexi_session").split("=")[1];
  const pool = createDatabasePool({
    connectionString: readDatabaseUrl("migration"),
    applicationName: "nexi-user-disable-test",
    maxConnections: 1,
  });
  try {
    await pool.query("UPDATE public.users SET status = 'disabled' WHERE id = $1", [
      SYNTHETIC_DATA.userA.id,
    ]);
    assert.equal(await readAuthSession(hashSessionToken(token)), null);
    const rejected = await handleLogin(
      formRequest("/api/auth/login", {
        audience: "client_admin",
        email: SYNTHETIC_DATA.userA.email,
        password: clientPassword,
      }),
    );
    assert.equal(responseLocation(rejected), "/ingresar?error=invalid");
    await pool.query("UPDATE public.users SET status = 'active' WHERE id = $1", [
      SYNTHETIC_DATA.userA.id,
    ]);
  } finally {
    await pool.end();
  }
});

test("expired sessions are rejected by the database session boundary", async () => {
  const token = randomBytes(32).toString("base64url");
  const pool = createDatabasePool({
    connectionString: readDatabaseUrl("migration"),
    applicationName: "nexi-expired-session-test",
    maxConnections: 1,
  });
  try {
    await pool.query(
      `INSERT INTO public.auth_sessions (
         token_hash,
         user_id,
         identity_provider,
         identity_subject,
         audience,
         assurance_level,
         active_tenant_id,
         created_at,
         last_seen_at,
         expires_at
       )
       VALUES (
         $1, $2, 'test', $3, 'client_admin', 'aal1', $4,
         transaction_timestamp() - interval '2 hours',
         transaction_timestamp() - interval '2 hours',
         transaction_timestamp() - interval '1 hour'
       )`,
      [
        hashSessionToken(token),
        SYNTHETIC_DATA.userA.id,
        SYNTHETIC_DATA.identityA.providerSubject,
        SYNTHETIC_DATA.tenantA.id,
      ],
    );
  } finally {
    await pool.end();
  }
  assert.equal(await readAuthSession(hashSessionToken(token)), null);
});

test("rate limiting blocks repeated attempts and reopens after its window", async () => {
  const key = randomBytes(32);
  assert.equal(
    (await consumeAuthRateLimit("login_identity", key, 2, 60, 60)).allowed,
    true,
  );
  assert.equal(
    (await consumeAuthRateLimit("login_identity", key, 2, 60, 60)).allowed,
    true,
  );
  assert.equal(
    (await consumeAuthRateLimit("login_identity", key, 2, 60, 60)).allowed,
    false,
  );
  const pool = createDatabasePool({
    connectionString: readDatabaseUrl("migration"),
    applicationName: "nexi-rate-window-test",
    maxConnections: 1,
  });
  try {
    await pool.query(
      `UPDATE public.auth_rate_limits
       SET
         window_started_at = transaction_timestamp() - interval '2 hours',
         blocked_until = NULL
       WHERE scope = 'login_identity' AND key_hash = $1`,
      [key],
    );
  } finally {
    await pool.end();
  }
  assert.equal(
    (await consumeAuthRateLimit("login_identity", key, 2, 60, 60)).allowed,
    true,
  );
});

test("authenticated request context reaches PostgreSQL only through RLS", async () => {
  const login = await handleLogin(
    formRequest("/api/auth/login", {
      audience: "client_admin",
      email: SYNTHETIC_DATA.userA.email,
      password: clientPassword,
    }),
  );
  const token = extractCookie(login, "nexi_session").split("=")[1];
  const session = await readAuthSession(hashSessionToken(token));
  assert.ok(session);
  const context = createAuthenticatedRequestContext(
    new Request("http://localhost:3000/cuenta", {
      headers: { "x-correlation-id": "auth-request-context-test" },
    }),
    session,
  );
  assert.equal(Object.isFrozen(context), true);
  assert.equal(context.identitySubject, SYNTHETIC_DATA.identityA.providerSubject);
  const tenant = await withAuthenticatedTenantDatabase(
    context,
    getCurrentTenant,
  );
  assert.equal(tenant?.id, SYNTHETIC_DATA.tenantA.id);
});
