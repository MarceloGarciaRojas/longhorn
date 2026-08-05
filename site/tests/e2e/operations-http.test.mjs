import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import test from "node:test";
import pg from "pg";

const { Pool } = pg;
const port = 32_500 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;
const clientAPassword = randomBytes(24).toString("base64url");
const clientBPassword = randomBytes(24).toString("base64url");
const adminPassword = randomBytes(24).toString("base64url");
const adminTotp = "418205";
let server;

function cookieFrom(response) {
  const match = /nexi_session=([^;]+)/.exec(
    response.headers.get("set-cookie") || "",
  );
  assert.ok(match);
  return `nexi_session=${match[1]}`;
}

async function waitUntilReady() {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {
      // Server is starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("operations E2E server did not start");
}

async function post(path, values, cookie) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin: baseUrl,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "nexi-operations-e2e",
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(values),
  });
}

async function get(path, cookie) {
  return fetch(`${baseUrl}${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

async function login(audience, email, password, oneTimeCode) {
  const response = await post("/api/auth/login", {
    audience,
    email,
    password,
    ...(oneTimeCode ? { one_time_code: oneTimeCode } : {}),
  });
  return cookieFrom(response);
}

test.before(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_MIGRATION_URL,
    max: 1,
  });
  await pool.query(
    "TRUNCATE public.auth_sessions,public.auth_audit_events,public.auth_rate_limits RESTART IDENTITY",
  );
  await pool.end();
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
        SITE_DELETION_GRACE_HOURS: "48",
        AUTH_SECURITY_PEPPER: randomBytes(32).toString("base64url"),
        AUTH_TEST_IDENTITIES: JSON.stringify([
          {
            email: "ana.demo@example.invalid",
            password: clientAPassword,
            subject: "test-client-a",
          },
          {
            email: "bruno.demo@example.invalid",
            password: clientBPassword,
            subject: "test-client-b",
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
  if (!server || server.killed) return;
  server.kill();
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
});

test("client and nexi administrator complete the Stage 7B HTTP flows", async () => {
  const clientA = await login(
    "client_admin",
    "ana.demo@example.invalid",
    clientAPassword,
  );
  const clientB = await login(
    "client_admin",
    "bruno.demo@example.invalid",
    clientBPassword,
  );
  const admin = await login(
    "nexi_admin",
    "admin.nexi@example.invalid",
    adminPassword,
    adminTotp,
  );

  const sitePanel = await get(
    "/cuenta/sitios/73333333-3333-4333-8333-333333333333",
    clientA,
  );
  const sitePanelHtml = await sitePanel.text();
  assert.match(sitePanelHtml, /Identidad|debe inicializar el contenido/i);
  assert.match(sitePanelHtml, /Guardar borrador|plantilla est[aá] asignada/i);
  assert.doesNotMatch(sitePanelHtml, /contenteditable|Editor visual/i);
  assert.equal(
    (
      await get(
        "/cuenta/sitios/74444444-4444-4444-8444-444444444444",
        clientA,
      )
    ).status,
    404,
  );

  const pool = new Pool({
    connectionString: process.env.DATABASE_MIGRATION_URL,
    max: 1,
  });
  const deletionKey = randomUUID();
  const deletion = await post(
    "/api/client/operations",
    {
      action: "deletion_request",
      site_id: "73333333-3333-4333-8333-333333333333",
      reason: "Solicitud E2E ficticia de eliminación controlada.",
      idempotency_key: deletionKey,
    },
    clientA,
  );
  assert.equal(
    new URL(deletion.headers.get("location")).searchParams.get("status"),
    "deletion-requested",
  );
  const deletionRow = await pool.query(
    "SELECT id FROM public.site_deletion_requests WHERE idempotency_key=$1",
    [deletionKey],
  );
  const canceled = await post(
    "/api/client/operations",
    {
      action: "deletion_cancel",
      request_id: deletionRow.rows[0].id,
    },
    clientA,
  );
  assert.equal(
    new URL(canceled.headers.get("location")).searchParams.get("status"),
    "deletion-canceled",
  );

  const domainKey = randomUUID();
  await post(
    "/api/client/operations",
    {
      action: "domain_request",
      site_id: "74444444-4444-4444-8444-444444444444",
      request_type: "register_new",
      desired_domain: "dominio-e2e-ficticio.cl",
      alternatives: "dominio-e2e-alternativo.cl",
      notes: "Solicitud sintética sin credenciales.",
      idempotency_key: domainKey,
    },
    clientB,
  );
  const domainRow = await pool.query(
    "SELECT id FROM public.site_domain_requests WHERE idempotency_key=$1",
    [domainKey],
  );
  assert.equal(domainRow.rowCount, 1);
  assert.equal(
    (
      await post(
        "/api/admin/operations",
        {
          action: "domain_request_update",
          request_id: domainRow.rows[0].id,
          request_status: "reviewing",
          internal_note: "Revisión E2E interna.",
        },
        admin,
      )
    ).status,
    303,
  );

  const siteSlug = `sitio-e2e-${randomBytes(4).toString("hex")}`;
  const createdSite = await post(
    "/api/admin/operations",
    {
      action: "site_create",
      tenant_id: "22222222-2222-4222-8222-222222222222",
      display_name: "Sitio E2E Ficticio",
      slug: siteSlug,
      idempotency_key: randomUUID(),
    },
    admin,
  );
  const createdPath = new URL(createdSite.headers.get("location")).pathname;
  const createdSiteId = createdPath.split("/").at(-1);
  assert.match(createdSiteId, /^[0-9a-f-]{36}$/i);
  await post(
    "/api/admin/operations",
    {
      action: "domain_assign",
      site_id: createdSiteId,
      hostname: `${siteSlug}.nexi.cl`,
      domain_type: "nexi_subdomain",
    },
    admin,
  );
  assert.match(
    await (await get(createdPath, admin)).text(),
    new RegExp(`${siteSlug}\\.nexi\\.cl`),
  );

  const archiveKey = randomUUID();
  await post(
    "/api/client/operations",
    {
      action: "deletion_request",
      site_id: "73333333-3333-4333-8333-333333333333",
      reason: "Solicitud E2E que terminará archivada.",
      idempotency_key: archiveKey,
    },
    clientA,
  );
  const archiveRow = await pool.query(
    "SELECT id FROM public.site_deletion_requests WHERE idempotency_key=$1",
    [archiveKey],
  );
  await post(
    "/api/admin/operations",
    {
      action: "deletion_review",
      request_id: archiveRow.rows[0].id,
      target_status: "approved",
      review_note: "Aprobación E2E.",
    },
    admin,
  );
  const early = await post(
    "/api/admin/operations",
    {
      action: "deletion_review",
      request_id: archiveRow.rows[0].id,
      target_status: "executed",
      review_note: "Intento E2E anticipado.",
    },
    admin,
  );
  assert.equal(
    new URL(early.headers.get("location")).searchParams.get("error"),
    "too_early",
  );
  await pool.query(
    "UPDATE public.site_deletion_requests SET eligible_at=requested_at+interval '1 millisecond' WHERE id=$1",
    [archiveRow.rows[0].id],
  );
  await post(
    "/api/admin/operations",
    {
      action: "deletion_review",
      request_id: archiveRow.rows[0].id,
      target_status: "executed",
      review_note: "Archivado E2E elegible.",
    },
    admin,
  );
  assert.equal(
    (
      await pool.query("SELECT status FROM public.sites WHERE id=$1", [
        "73333333-3333-4333-8333-333333333333",
      ])
    ).rows[0].status,
    "archived",
  );

  const conversation = await post(
    "/api/client/operations",
    {
      action: "conversation_create",
      category: "general",
      subject: "Conversación E2E ficticia",
      body: "Mensaje E2E del cliente.",
      idempotency_key: randomUUID(),
      message_idempotency_key: randomUUID(),
    },
    clientA,
  );
  const conversationPath = new URL(
    conversation.headers.get("location"),
  ).pathname;
  const conversationId = conversationPath.split("/").at(-1);
  assert.match(
    await (await get(`/nexi-interno/soporte/${conversationId}`, admin)).text(),
    /Mensaje E2E del cliente/,
  );
  const supportReply = await post(
    "/api/admin/operations",
    {
      action: "support_reply",
      conversation_id: conversationId,
      body: "Respuesta E2E sintética de soporte.",
      idempotency_key: randomUUID(),
    },
    admin,
  );
  assert.equal(
    new URL(supportReply.headers.get("location")).searchParams.get("status"),
    "sent",
  );
  assert.match(
    await (await get("/cuenta/mensajes", clientA)).text(),
    /Conversación E2E ficticia/,
  );
  assert.match(
    await (await get(`/cuenta/mensajes/${conversationId}`, clientA)).text(),
    /Respuesta E2E sintética de soporte/,
  );
  assert.match(
    await (await get("/nexi-interno/auditoria", admin)).text(),
    /Sitio creado|Dominio registrado|Sitio archivado/,
  );
  await pool.end();
});
