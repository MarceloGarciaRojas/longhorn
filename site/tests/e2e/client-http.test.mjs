import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import test from "node:test";

import pg from "pg";

const { Pool } = pg;
const port = 32_100 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;
const singlePassword = randomBytes(24).toString("base64url");
const multiPassword = randomBytes(24).toString("base64url");
let server;

function cookieFrom(response, name = "nexi_session") {
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
      // The built server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("vinext production server did not become ready");
}

async function post(path, values, cookie, accept = "text/html") {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      accept,
      origin: baseUrl,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "nexi-client-e2e-browser",
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(values),
  });
}

async function page(path, cookie, redirect = "follow") {
  return fetch(`${baseUrl}${path}`, {
    redirect,
    headers: cookie ? { cookie } : {},
  });
}

test.before(async () => {
  assert.ok(process.env.DATABASE_MIGRATION_URL);
  const pool = new Pool({
    connectionString: process.env.DATABASE_MIGRATION_URL,
    max: 1,
  });
  try {
    await pool.query(
      `TRUNCATE public.auth_sessions, public.auth_audit_events,
         public.auth_rate_limits RESTART IDENTITY`,
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
            email: "ana.demo@example.invalid",
            password: singlePassword,
            subject: "test-client-a",
          },
          {
            email: "multi.demo@example.invalid",
            password: multiPassword,
            subject: "test-client-multi",
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
  if (!server || server.killed) return;
  server.kill();
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
});

test("single-company client completes the protected account flow", async () => {
  const anonymous = await page("/cuenta", undefined, "manual");
  assert.ok([303, 307, 308].includes(anonymous.status));
  assert.equal(new URL(anonymous.headers.get("location")).pathname, "/ingresar");

  const login = await post("/api/auth/login", {
    audience: "client_admin",
    email: "ana.demo@example.invalid",
    password: singlePassword,
  });
  assert.equal(new URL(login.headers.get("location")).pathname, "/cuenta");
  const cookie = cookieFrom(login);

  const dashboard = await page("/cuenta", cookie);
  const dashboardHtml = await dashboard.text();
  assert.equal(dashboard.status, 200);
  assert.match(dashboardHtml, /Mis sitios/);
  assert.match(dashboardHtml, /Esencial/);
  assert.doesNotMatch(dashboardHtml, /tenant_id|Row Level Security|UUID|Longhorn/i);

  const sites = await page("/cuenta/sitios", cookie);
  const sitesHtml = await sites.text();
  assert.match(sitesHtml, /Sitio Cobre Norte/);
  assert.doesNotMatch(sitesHtml, /Crear sitio|Solicitar dominio|Eliminar/);

  const plan = await page("/cuenta/plan", cookie);
  const planHtml = await plan.text();
  assert.match(planHtml, /Sitio autogestionable/);
  assert.doesNotMatch(planHtml, /Pagar|Cambiar plan|Flow/);

  const dataPage = await page("/cuenta/datos", cookie);
  const dataHtml = await dataPage.text();
  const personalVersion = /name="profile_version" value="(\d+)"/.exec(dataHtml);
  assert.ok(personalVersion);
  assert.match(dataHtml, /solo lectura|contacta a soporte nexi/i);

  const saved = await post(
    "/api/client/actions",
    {
      action: "personal_profile_update",
      display_name: "Ana E2E Ficticia",
      phone: "+56955555555",
      locale: "es-CL",
      profile_version: personalVersion[1],
    },
    cookie,
    "application/json",
  );
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.ok, true);

  const persisted = await page("/cuenta/datos", cookie);
  assert.match(await persisted.text(), /Ana E2E Ficticia/);

  const forbidden = await post(
    "/api/client/actions",
    {
      action: "personal_profile_update",
      display_name: "No autorizado",
      phone: "",
      locale: "es-CL",
      profile_version: String(savedBody.version),
      role: "nexi_admin",
    },
    cookie,
    "application/json",
  );
  assert.equal(forbidden.status, 403);

  const messages = await page("/cuenta/mensajes", cookie);
  const messagesHtml = await messages.text();
  assert.match(messagesHtml, /Nueva conversación/);
  assert.match(messagesHtml, /name="body"/i);

  const logout = await post("/api/auth/logout", {}, cookie);
  assert.equal(logout.status, 303);
  const protectedAfterLogout = await page("/cuenta", cookie, "manual");
  assert.ok([303, 307, 308].includes(protectedAfterLogout.status));
  assert.equal(
    new URL(protectedAfterLogout.headers.get("location")).pathname,
    "/ingresar",
  );
});

test("multi-company client changes context without leaking prior data", async () => {
  const login = await post("/api/auth/login", {
    audience: "client_admin",
    email: "multi.demo@example.invalid",
    password: multiPassword,
  });
  assert.equal(
    new URL(login.headers.get("location")).pathname,
    "/seleccionar-empresa",
  );
  const initialCookie = cookieFrom(login);

  const selector = await page("/seleccionar-empresa", initialCookie);
  const selectorHtml = await selector.text();
  assert.match(selectorHtml, /Cobre Norte Ficticia/);
  assert.match(selectorHtml, /Taller Laguna Ficticio/);

  const selectedA = await post(
    "/api/auth/select-tenant",
    { tenant_id: "11111111-1111-4111-8111-111111111111" },
    initialCookie,
  );
  const cookieA = cookieFrom(selectedA);
  assert.match(await (await page("/cuenta/sitios", cookieA)).text(), /Sitio Cobre Norte/);

  const change = await page("/seleccionar-empresa?change=1", cookieA);
  assert.match(await change.text(), /Cambiar|Selecciona una empresa/i);

  const selectedB = await post(
    "/api/auth/select-tenant",
    { tenant_id: "22222222-2222-4222-8222-222222222222" },
    cookieA,
  );
  const cookieB = cookieFrom(selectedB);
  const sitesB = await (await page("/cuenta/sitios", cookieB)).text();
  assert.match(sitesB, /Sitio Taller Laguna/);
  assert.doesNotMatch(sitesB, /Sitio Cobre Norte/);
  assert.match(await (await page("/cuenta/plan", cookieB)).text(), /Pro/);

  const revokedA = await page("/cuenta", cookieA, "manual");
  assert.ok([303, 307, 308].includes(revokedA.status));

  const foreign = await post(
    "/api/auth/select-tenant",
    { tenant_id: "33333333-3333-4333-8333-333333333333" },
    cookieB,
  );
  assert.equal(
    new URL(foreign.headers.get("location")).searchParams.get("error"),
    "invalid",
  );
  const stillB = await (await page("/cuenta/sitios", cookieB)).text();
  assert.match(stillB, /Sitio Taller Laguna/);
  assert.doesNotMatch(stillB, /Sitio Cobre Norte/);
});
