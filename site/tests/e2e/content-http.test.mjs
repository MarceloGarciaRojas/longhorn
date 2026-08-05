import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import test from "node:test";
import pg from "pg";

const { Pool } = pg;
const port = 32_800 + Math.floor(Math.random() * 300);
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
      // The built server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("content E2E server did not start");
}

async function post(path, values, cookie, accept = "application/json") {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      accept,
      origin: baseUrl,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "nexi-content-e2e",
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(values),
  });
}

async function page(path, cookie) {
  return fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
}

async function login(audience, email, password, oneTimeCode) {
  const response = await post(
    "/api/auth/login",
    {
      audience,
      email,
      password,
      ...(oneTimeCode ? { one_time_code: oneTimeCode } : {}),
    },
    undefined,
    "text/html",
  );
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

test("administrator and client complete the Stage 8A publication flow", async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_MIGRATION_URL,
    max: 1,
  });
  const admin = await login(
    "nexi_admin",
    "admin.nexi@example.invalid",
    adminPassword,
    adminTotp,
  );
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

  try {
    const siteKey = randomUUID();
    const created = await post(
      "/api/admin/operations",
      {
        action: "site_create",
        tenant_id: "11111111-1111-4111-8111-111111111111",
        display_name: "Restaurante E2E Ficticio",
        slug: "restaurante-e2e-ficticio",
        idempotency_key: siteKey,
      },
      admin,
    );
    assert.equal(created.status, 200);
    const site = await pool.query(
      "SELECT id FROM public.sites WHERE slug=$1",
      ["restaurante-e2e-ficticio"],
    );
    const newSiteId = site.rows[0].id;
    assert.equal(
      (
        await post(
          "/api/admin/operations",
          {
            action: "template_assign",
            site_id: newSiteId,
            template_version_id: "a8222222-2222-4222-8222-222222222222",
            idempotency_key: randomUUID(),
          },
          admin,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await post(
          "/api/admin/operations",
          {
            action: "content_initialize",
            site_id: newSiteId,
            idempotency_key: randomUUID(),
          },
          admin,
        )
      ).status,
      200,
    );
    const initialized = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM public.site_content_drafts WHERE site_id=$1) drafts,
         (SELECT count(*)::int FROM public.site_content_publications WHERE site_id=$1) publications`,
      [newSiteId],
    );
    assert.deepEqual(initialized.rows[0], { drafts: 1, publications: 0 });
    const preparation = await page("/sitios/restaurante-e2e-ficticio");
    const preparationHtml = await preparation.text();
    assert.match(preparationHtml, /Sitio en preparaci/i);
    assert.match(preparationHtml, /noindex/i);

    const siteId = "72222222-2222-4222-8222-222222222222";
    const editor = await page(`/cuenta/sitios/${siteId}`, clientB);
    const editorHtml = await editor.text();
    assert.equal(editor.status, 200);
    assert.match(editorHtml, /Identidad/);
    assert.match(editorHtml, /Menú|MenÃº/);
    assert.match(editorHtml, /Guardar borrador/);
    assert.doesNotMatch(
      editorHtml,
      /contenteditable|name="(?:html|css|javascript)"/i,
    );

    const initial = await pool.query(
      `SELECT revision,content FROM public.site_content_drafts WHERE site_id=$1`,
      [siteId],
    );
    const firstPublication = await pool.query(
      `SELECT id,content_snapshot FROM public.site_content_publications
       WHERE site_id=$1 ORDER BY publication_number LIMIT 1`,
      [siteId],
    );
    const content = initial.rows[0].content;
    content.identity.business_name = "Restaurante HTTP E2E Ficticio";
    content.hero.headline = "Titular de borrador HTTP 8A";
    const saved = await post(
      "/api/client/operations",
      {
        action: "content_save",
        site_id: siteId,
        revision: String(initial.rows[0].revision),
        idempotency_key: randomUUID(),
        content_json: JSON.stringify(content),
      },
      clientB,
    );
    assert.equal(saved.status, 200);

    const preview = await page(`/cuenta/sitios/${siteId}/preview`, clientB);
    const previewHtml = await preview.text();
    assert.equal(preview.status, 200);
    assert.match(previewHtml, /Titular de borrador HTTP 8A/);
    assert.match(previewHtml, /noindex/i);
    assert.equal(
      (await page(`/cuenta/sitios/${siteId}/preview`, clientA)).status,
      404,
    );
    const publicBefore = await page("/sitios/taller-laguna");
    assert.doesNotMatch(await publicBefore.text(), /Titular de borrador HTTP 8A/);

    const revision = Number(initial.rows[0].revision) + 1;
    const published = await post(
      "/api/client/operations",
      {
        action: "content_publish",
        site_id: siteId,
        revision: String(revision),
        idempotency_key: randomUUID(),
      },
      clientB,
    );
    assert.equal(published.status, 200);
    assert.match(
      await (await page("/sitios/taller-laguna")).text(),
      /Titular de borrador HTTP 8A/,
    );

    content.hero.headline = "Segunda publicación HTTP 8A";
    await post(
      "/api/client/operations",
      {
        action: "content_save",
        site_id: siteId,
        revision: String(revision),
        idempotency_key: randomUUID(),
        content_json: JSON.stringify(content),
      },
      clientB,
    );
    await post(
      "/api/client/operations",
      {
        action: "content_publish",
        site_id: siteId,
        revision: String(revision + 1),
        idempotency_key: randomUUID(),
      },
      clientB,
    );
    const history = await pool.query(
      `SELECT count(*)::int AS count FROM public.site_content_publications
       WHERE site_id=$1`,
      [siteId],
    );
    assert.equal(history.rows[0].count, 3);
    const restored = await post(
      "/api/client/operations",
      {
        action: "content_restore",
        site_id: siteId,
        publication_id: firstPublication.rows[0].id,
        idempotency_key: randomUUID(),
      },
      clientB,
    );
    assert.equal(restored.status, 200);
    const finalHistory = await pool.query(
      `SELECT publication_number,restored_from_publication_id
       FROM public.site_content_publications
       WHERE site_id=$1 ORDER BY publication_number DESC LIMIT 1`,
      [siteId],
    );
    assert.equal(finalHistory.rows[0].publication_number, 4);
    assert.equal(
      finalHistory.rows[0].restored_from_publication_id,
      firstPublication.rows[0].id,
    );
    assert.match(
      await (await page("/sitios/taller-laguna")).text(),
      new RegExp(firstPublication.rows[0].content_snapshot.hero.headline),
    );

    const audit = await page("/nexi-interno/auditoria", admin);
    const auditHtml = await audit.text();
    assert.match(auditHtml, /Plantilla asignada|Contenido inicializado/);
    assert.doesNotMatch(auditHtml, /Titular de borrador HTTP 8A/);

    assert.ok(
      [200, 303].includes(
        (
          await post(
            "/api/auth/logout",
            {},
            clientB,
            "text/html",
          )
        ).status,
      ),
    );
  } finally {
    await pool.end();
  }
});
