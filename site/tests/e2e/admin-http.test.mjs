import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import test from "node:test";

import pg from "pg";

const { Pool } = pg;
const port = 31_600 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;
const adminPassword = randomBytes(24).toString("base64url");
const invitedPassword = randomBytes(24).toString("base64url");
const adminTotp = "725194";
const invitedEmail = `cliente.${randomBytes(5).toString("hex")}@example.invalid`;
const invitedSubject = `test-stage6-${randomBytes(8).toString("hex")}`;
const slug = `empresa-e2e-${randomBytes(4).toString("hex")}`;
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
      if (response.ok) return;
    } catch {
      // The built Vinext server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("vinext production server did not become ready");
}

async function post(path, values, cookie, origin = baseUrl) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "nexi-admin-e2e-browser",
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(values),
  });
}

test.before(async () => {
  assert.ok(process.env.DATABASE_MIGRATION_URL);
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
            email: "admin.nexi@example.invalid",
            password: adminPassword,
            subject: "test-admin",
            oneTimeCode: adminTotp,
          },
          {
            email: invitedEmail,
            password: invitedPassword,
            subject: invitedSubject,
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
  if (server && !server.killed) {
    server.kill();
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
  }
});

test("administrator completes the tenant lifecycle through the protected panel", async () => {
  const anonymous = await fetch(`${baseUrl}/nexi-interno`, {
    redirect: "manual",
  });
  assert.ok([303, 307, 308].includes(anonymous.status));
  assert.equal(
    new URL(anonymous.headers.get("location")).pathname,
    "/nexi-interno/ingresar",
  );

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
  const adminCookie = cookieFrom(login, "nexi_session");

  const dashboard = await fetch(`${baseUrl}/nexi-interno`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(dashboard.status, 200);
  const dashboardHtml = await dashboard.text();
  assert.match(dashboardHtml, /Resumen operativo/);
  assert.match(dashboardHtml, /Clientes totales/);

  const invalidOrigin = await post(
    "/api/admin/actions",
    { action: "tenant_create" },
    adminCookie,
    "https://attacker.invalid",
  );
  assert.equal(invalidOrigin.status, 403);

  const created = await post(
    "/api/admin/actions",
    {
      action: "tenant_create",
      idempotency_key: randomUUID(),
      display_name: "Empresa E2E Etapa 6",
      slug,
      timezone: "America/Santiago",
      locale: "es-CL",
    },
    adminCookie,
  );
  assert.equal(created.status, 303);
  const createdLocation = new URL(created.headers.get("location"));
  const tenantMatch = /\/clientes\/([0-9a-f-]{36})$/.exec(createdLocation.pathname);
  assert.ok(tenantMatch);
  const tenantId = tenantMatch[1];

  const detail = await fetch(`${baseUrl}${createdLocation.pathname}`, {
    headers: { cookie: adminCookie },
  });
  const detailHtml = await detail.text();
  assert.match(detailHtml, /Empresa E2E Etapa 6/);
  assert.match(detailHtml, /Borrador/);

  const invited = await post(
    "/api/admin/actions",
    {
      action: "invitation_create",
      tenant_id: tenantId,
      idempotency_key: randomUUID(),
      display_name: "Cliente E2E",
      email: invitedEmail,
    },
    adminCookie,
  );
  const invitationLocation = new URL(invited.headers.get("location"));
  const invitationToken = invitationLocation.searchParams.get("synthetic");
  assert.ok(invitationToken);

  const accepted = await post("/api/invitations/accept", {
    token: invitationToken,
  });
  assert.equal(
    new URL(accepted.headers.get("location")).searchParams.get("status"),
    "accepted",
  );

  const activated = await post(
    "/api/admin/actions",
    {
      action: "tenant_status",
      tenant_id: tenantId,
      target_status: "active",
      reason: "Activación E2E validada",
    },
    adminCookie,
  );
  assert.equal(
    new URL(activated.headers.get("location")).searchParams.get("status"),
    "state-changed",
  );

  const clientLogin = await post("/api/auth/login", {
    audience: "client_admin",
    email: invitedEmail,
    password: invitedPassword,
  });
  assert.equal(
    new URL(clientLogin.headers.get("location")).pathname,
    "/cuenta",
  );
  const clientCookie = cookieFrom(clientLogin, "nexi_session");
  const account = await fetch(`${baseUrl}/cuenta`, {
    headers: { cookie: clientCookie },
  });
  assert.match(await account.text(), /Empresa E2E Etapa 6/);

  const directAdminCall = await post(
    "/api/admin/actions",
    {
      action: "tenant_status",
      tenant_id: tenantId,
      target_status: "suspended",
      reason: "Intento no autorizado",
    },
    clientCookie,
  );
  assert.equal(
    new URL(directAdminCall.headers.get("location")).pathname,
    "/nexi-interno/ingresar",
  );

  await post(
    "/api/admin/actions",
    {
      action: "tenant_status",
      tenant_id: tenantId,
      target_status: "suspended",
      reason: "Suspensión E2E controlada",
    },
    adminCookie,
  );
  const suspendedAccess = await fetch(`${baseUrl}/cuenta`, {
    headers: { cookie: clientCookie },
    redirect: "manual",
  });
  assert.ok([303, 307, 308].includes(suspendedAccess.status));

  await post(
    "/api/admin/actions",
    {
      action: "tenant_status",
      tenant_id: tenantId,
      target_status: "active",
      reason: "Reactivación E2E controlada",
    },
    adminCookie,
  );
  const secondClientLogin = await post("/api/auth/login", {
    audience: "client_admin",
    email: invitedEmail,
    password: invitedPassword,
  });
  const secondClientCookie = cookieFrom(secondClientLogin, "nexi_session");
  assert.equal(
    (await fetch(`${baseUrl}/cuenta`, {
      headers: { cookie: secondClientCookie },
    })).status,
    200,
  );

  const pool = new Pool({
    connectionString: process.env.DATABASE_MIGRATION_URL,
    max: 1,
  });
  const membership = await pool.query(
    `SELECT membership.id
     FROM public.tenant_memberships AS membership
     JOIN public.users AS account ON account.id = membership.user_id
     WHERE membership.tenant_id = $1 AND account.email = $2`,
    [tenantId, invitedEmail],
  );
  await pool.end();
  assert.equal(membership.rowCount, 1);

  await post(
    "/api/admin/actions",
    {
      action: "membership_status",
      tenant_id: tenantId,
      membership_id: membership.rows[0].id,
      target_status: "disabled",
      reason: "Desactivación E2E controlada",
    },
    adminCookie,
  );
  const disabledAccess = await fetch(`${baseUrl}/cuenta`, {
    headers: { cookie: secondClientCookie },
    redirect: "manual",
  });
  assert.ok([303, 307, 308].includes(disabledAccess.status));

  const audit = await fetch(
    `${baseUrl}/nexi-interno/auditoria?tenant=${tenantId}`,
    { headers: { cookie: adminCookie } },
  );
  const auditHtml = await audit.text();
  assert.match(auditHtml, /Cliente creado/);
  assert.match(auditHtml, /Cliente suspendido/);
  assert.match(auditHtml, /Acceso desactivado/);

  const logout = await post("/api/auth/logout", {}, adminCookie);
  assert.equal(logout.status, 303);
  const protectedAfterLogout = await fetch(`${baseUrl}/nexi-interno`, {
    headers: { cookie: adminCookie },
    redirect: "manual",
  });
  assert.ok([303, 307, 308].includes(protectedAfterLogout.status));
});
