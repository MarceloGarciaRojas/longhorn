import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import test from "node:test";

import pg from "pg";

const { Pool } = pg;
const port = 31_000 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
const clientPassword = randomBytes(24).toString("base64url");
const adminPassword = randomBytes(24).toString("base64url");
const adminTotp = "418362";
let server;

function cookieFrom(response, name) {
  const setCookie = response.headers.get("set-cookie") || "";
  const match = new RegExp(`${name}=([^;]+)`).exec(setCookie);
  assert.ok(match, `missing ${name} cookie`);
  return `${name}=${match[1]}`;
}

async function waitUntilReady() {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("vinext production server did not become ready");
}

async function post(path, values, cookie) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin: baseUrl,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "nexi-e2e-browser",
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(values),
  });
}

test.before(async () => {
  assert.ok(
    process.env.DATABASE_MIGRATION_URL,
    "DATABASE_MIGRATION_URL is required for E2E cleanup",
  );
  const pool = new Pool({
    connectionString: process.env.DATABASE_MIGRATION_URL,
    max: 1,
  });
  try {
    await pool.query(
      "TRUNCATE public.auth_sessions, public.auth_audit_events, public.auth_rate_limits RESTART IDENTITY",
    );
  } finally {
    await pool.end();
  }

  server = spawn(
    process.execPath,
    [
      "node_modules/vinext/dist/cli.js",
      "start",
      "--port",
      String(port),
      "--hostname",
      "127.0.0.1",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        APP_ENV: "test",
        APP_URL: baseUrl,
        AUTH_PROVIDER: "test",
        AUTH_SECURITY_PEPPER: randomBytes(32).toString("base64url"),
        AUTH_TEST_IDENTITIES: JSON.stringify([
          {
            email: "multi.demo@example.invalid",
            password: clientPassword,
            subject: "test-client-multi",
          },
          {
            email: "admin.nexi@example.invalid",
            password: adminPassword,
            subject: "test-admin",
            oneTimeCode: adminTotp,
          },
        ]),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  await waitUntilReady();
});

test.after(async () => {
  if (!server || server.killed) {
    return;
  }
  server.kill();
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
});

test("client administrator completes the protected HTTP flow", async () => {
  const landing = await fetch(baseUrl);
  assert.equal(landing.status, 200);
  assert.ok(!(await landing.text()).includes("nexi-interno"));

  const loginPage = await fetch(`${baseUrl}/ingresar`);
  assert.equal(loginPage.status, 200);
  assert.match(await loginPage.text(), /Ingresa a tu cuenta/);

  const login = await post("/api/auth/login", {
    audience: "client_admin",
    email: "multi.demo@example.invalid",
    password: clientPassword,
  });
  assert.equal(login.status, 303);
  assert.equal(
    new URL(login.headers.get("location")).pathname,
    "/seleccionar-empresa",
  );
  const initialCookie = cookieFrom(login, "nexi_session");

  const tenantPage = await fetch(`${baseUrl}/seleccionar-empresa`, {
    headers: { cookie: initialCookie },
  });
  assert.equal(tenantPage.status, 200);
  const tenantHtml = await tenantPage.text();
  assert.match(tenantHtml, /Cobre Norte Ficticia/);
  assert.match(tenantHtml, /Taller Laguna Ficticio/);

  const selected = await post(
    "/api/auth/select-tenant",
    { tenant_id: "11111111-1111-4111-8111-111111111111" },
    initialCookie,
  );
  assert.equal(selected.status, 303);
  assert.equal(new URL(selected.headers.get("location")).pathname, "/cuenta");
  const cookie = cookieFrom(selected, "nexi_session");

  const account = await fetch(`${baseUrl}/cuenta`, {
    headers: { cookie },
    redirect: "manual",
  });
  assert.equal(account.status, 200);
  const accountHtml = await account.text();
  assert.match(accountHtml, /Cuenta Multiempresa/);
  assert.match(accountHtml, /Cobre Norte Ficticia/);

  const foreignTenant = await post(
    "/api/auth/select-tenant",
    { tenant_id: "33333333-3333-4333-8333-333333333333" },
    cookie,
  );
  assert.equal(
    new URL(foreignTenant.headers.get("location")).searchParams.get("error"),
    "invalid",
  );

  const internalDenied = await fetch(`${baseUrl}/nexi-interno`, {
    headers: { cookie },
    redirect: "manual",
  });
  assert.ok([303, 307, 308].includes(internalDenied.status));
  assert.equal(
    new URL(internalDenied.headers.get("location")).pathname,
    "/nexi-interno/ingresar",
  );

  const logout = await post("/api/auth/logout", {}, cookie);
  assert.equal(logout.status, 303);
  const expiredAccess = await fetch(`${baseUrl}/cuenta`, {
    headers: { cookie },
    redirect: "manual",
  });
  assert.ok([303, 307, 308].includes(expiredAccess.status));
  assert.equal(new URL(expiredAccess.headers.get("location")).pathname, "/ingresar");
});

test("nexi administrator reaches the separate route only with TOTP", async () => {
  const withoutMfa = await post("/api/auth/login", {
    audience: "nexi_admin",
    email: "admin.nexi@example.invalid",
    password: adminPassword,
  });
  assert.equal(
    new URL(withoutMfa.headers.get("location")).searchParams.get("error"),
    "mfa",
  );

  const login = await post("/api/auth/login", {
    audience: "nexi_admin",
    email: "admin.nexi@example.invalid",
    password: adminPassword,
    one_time_code: adminTotp,
  });
  assert.equal(login.status, 303);
  assert.equal(new URL(login.headers.get("location")).pathname, "/nexi-interno");
  const cookie = cookieFrom(login, "nexi_session");
  const internal = await fetch(`${baseUrl}/nexi-interno`, {
    headers: { cookie },
    redirect: "manual",
  });
  assert.equal(internal.status, 200);
  assert.match(await internal.text(), /Segundo factor verificado/);

  const logout = await post("/api/auth/logout", {}, cookie);
  assert.equal(logout.status, 303);
  const revoked = await fetch(`${baseUrl}/nexi-interno`, {
    headers: { cookie },
    redirect: "manual",
  });
  assert.ok([303, 307, 308].includes(revoked.status));
  assert.equal(
    new URL(revoked.headers.get("location")).pathname,
    "/nexi-interno/ingresar",
  );
});
