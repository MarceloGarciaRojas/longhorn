import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import test from "node:test";
import pg from "pg";
import sharp from "sharp";

const { Pool } = pg;
const port = 33_300 + Math.floor(Math.random() * 200);
const mediaPort = 43_300 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const mediaUrl = `http://127.0.0.1:${mediaPort}`;
const clientAPassword = randomBytes(24).toString("base64url");
const clientBPassword = randomBytes(24).toString("base64url");
const adminPassword = randomBytes(24).toString("base64url");
const adminTotp = "725194";
let server;
let mediaServer;
let serverOutput = "";
let mediaOutput = "";

function cookieFrom(response) {
  const match = /nexi_session=([^;]+)/.exec(response.headers.get("set-cookie") || "");
  assert.ok(match);
  return `nexi_session=${match[1]}`;
}

async function ready(url, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`${label} did not start`);
}

async function login(
  email,
  password,
  audience = "client_admin",
  oneTimeCode = "",
) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin: baseUrl,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      audience,
      email,
      password,
      one_time_code: oneTimeCode,
    }),
  });
  return cookieFrom(response);
}

async function formPost(path, values, cookie) {
  const form = values instanceof FormData ? values : new URLSearchParams(values);
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      accept: "application/json",
      origin: baseUrl,
      cookie,
      ...(!(form instanceof FormData)
        ? { "content-type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: form,
  });
}

async function page(path, cookie) {
  return fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    headers: { cookie, origin: baseUrl },
  });
}

test.before(async () => {
  const common = {
    ...process.env,
    APP_ENV: "test",
    APP_URL: baseUrl,
    MEDIA_STORAGE_PROVIDER: "local",
    MEDIA_LOCAL_SERVICE_URL: mediaUrl,
    MEDIA_LOCAL_SERVICE_PORT: String(mediaPort),
  };
  mediaServer = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/media/cli.ts", "serve"],
    { cwd: process.cwd(), env: common, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  mediaServer.stdout.on("data", (chunk) => { mediaOutput += String(chunk); });
  mediaServer.stderr.on("data", (chunk) => { mediaOutput += String(chunk); });
  await ready(`${mediaUrl}/health`, "media service");
  const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 1 });
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
        ...common,
        AUTH_PROVIDER: "test",
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
  server.stdout.on("data", (chunk) => { serverOutput += String(chunk); });
  server.stderr.on("data", (chunk) => { serverOutput += String(chunk); });
  await ready(`${baseUrl}/api/health`, "application");
});

test.after(async () => {
  for (const processHandle of [server, mediaServer]) {
    if (!processHandle || processHandle.killed) continue;
    processHandle.kill();
    await Promise.race([
      new Promise((resolve) => processHandle.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
});

test("client uploads, references, publishes and switches template without cross-tenant leakage", async () => {
  const clientA = await login("ana.demo@example.invalid", clientAPassword);
  const clientB = await login("bruno.demo@example.invalid", clientBPassword);
  const admin = await login(
    "admin.nexi@example.invalid",
    adminPassword,
    "nexi_admin",
    adminTotp,
  );
  const siteId = "72222222-2222-4222-8222-222222222222";
  const editorialVersionId = "a8aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 1 });
  try {
    const original = await pool.query(
      "SELECT current_publication_id FROM public.sites WHERE id=$1",
      [siteId],
    );
    const originalPublicationId = original.rows[0].current_publication_id;
    const catalog = await page(`/cuenta/sitios/${siteId}/plantillas`, clientB);
    const catalogHtml = await catalog.text();
    assert.equal(catalog.status, 200);
    assert.match(catalogHtml, /Restaurante Editorial/);
    assert.doesNotMatch(catalogHtml, /no seleccionable/);
    assert.match(
      catalogHtml,
      new RegExp(
        `template_version_id" value="${editorialVersionId}"[\\s\\S]{0,800}Seleccionar`,
      ),
    );
    assert.equal(
      (await page(`/cuenta/sitios/${siteId}/plantillas`, clientA)).status,
      404,
    );
    const clientEditorialPreview = await page(
      `/cuenta/sitios/${siteId}/plantillas/${editorialVersionId}/preview`,
      clientB,
    );
    const clientEditorialHtml = await clientEditorialPreview.text();
    assert.equal(clientEditorialPreview.status, 200);
    assert.match(clientEditorialHtml, /Vista previa privada/);
    assert.match(clientEditorialHtml, /noindex/i);
    assert.equal(
      (await page(
        `/cuenta/sitios/${siteId}/plantillas/${editorialVersionId}/preview`,
        clientA,
      )).status,
      404,
    );
    assert.ok(
      [303, 307, 308].includes(
        (await page(
          `/cuenta/sitios/${siteId}/plantillas/${editorialVersionId}/preview`,
          "",
        )).status,
      ),
    );
    const adminCatalog = await page(`/nexi-interno/sitios/${siteId}`, admin);
    const adminCatalogHtml = await adminCatalog.text();
    assert.equal(adminCatalog.status, 200);
    assert.match(
      adminCatalogHtml,
      new RegExp(
        `/nexi-interno/sitios/${siteId}/plantillas/${editorialVersionId}/preview`,
      ),
    );
    assert.match(adminCatalogHtml, /Restaurante Editorial/);
    assert.doesNotMatch(adminCatalogHtml, /no seleccionable/);
    assert.match(
      adminCatalogHtml,
      new RegExp(`option value="${editorialVersionId}"`),
    );
    assert.equal(
      (await page(
        `/nexi-interno/sitios/${siteId}/plantillas/${editorialVersionId}/preview`,
        admin,
      )).status,
      200,
    );
    const protectedState = await pool.query(
      `SELECT assignment.template_version_id,assignment.version,
         site.current_publication_id,
         (SELECT count(*)::int FROM public.site_content_publications publication
          WHERE publication.site_id=site.id) AS publications
       FROM public.sites site
       JOIN public.site_template_assignments assignment
         ON assignment.site_id=site.id
       WHERE site.id=$1`,
      [siteId],
    );
    const editorialSelection = await formPost(
      "/api/client/operations",
      {
        action: "template_change",
        site_id: siteId,
        template_version_id: editorialVersionId,
        assignment_version: String(protectedState.rows[0].version),
        idempotency_key: randomUUID(),
      },
      clientB,
    );
    assert.equal(editorialSelection.status, 200);
    assert.deepEqual(
      (await pool.query(
        `SELECT assignment.template_version_id,assignment.version,
           site.current_publication_id,
           (SELECT count(*)::int FROM public.site_content_publications publication
            WHERE publication.site_id=site.id) AS publications
         FROM public.sites site
         JOIN public.site_template_assignments assignment
           ON assignment.site_id=site.id
         WHERE site.id=$1`,
        [siteId],
      )).rows[0],
      {
        ...protectedState.rows[0],
        template_version_id: editorialVersionId,
        version: protectedState.rows[0].version + 1,
      },
    );
    const png = await sharp({
      create: { width: 900, height: 600, channels: 4, background: "#257b69" },
    }).png().toBuffer();
    const upload = new FormData();
    upload.set("action", "upload");
    upload.set("site_id", siteId);
    upload.set("idempotency_key", randomUUID());
    upload.set("display_name", "Imagen HTTP sintética");
    upload.set("file", new File([png], "synthetic.png", { type: "image/png" }));
    const uploaded = await formPost("/api/media/client", upload, clientB);
    const uploadedBody = await uploaded.text();
    assert.equal(
      uploaded.status,
      201,
      `${uploadedBody}\nAPP:${serverOutput.slice(-2000)}\nMEDIA:${mediaOutput.slice(-2000)}`,
    );
    const { assetId } = JSON.parse(uploadedBody);
    assert.match(assetId, /^[0-9a-f-]{36}$/);

    const thumbnail = await page(`/api/media/private/${assetId}/thumbnail`, clientB);
    assert.equal(thumbnail.status, 200);
    assert.equal(thumbnail.headers.get("content-type"), "image/webp");
    assert.equal(thumbnail.headers.get("cache-control"), "private, no-store");
    assert.equal(
      (await page(`/api/media/private/${assetId}/thumbnail`, clientA)).status,
      404,
    );

    const draft = await pool.query(
      "SELECT revision,content FROM public.site_content_drafts WHERE site_id=$1",
      [siteId],
    );
    const content = draft.rows[0].content;
    content.hero.media = {
      assetId,
      altText: "Preparación sintética de portada",
      decorative: false,
    };
    const saved = await formPost(
      "/api/client/operations",
      {
        action: "content_save",
        site_id: siteId,
        revision: String(draft.rows[0].revision),
        idempotency_key: randomUUID(),
        content_json: JSON.stringify(content),
      },
      clientB,
    );
    assert.equal(saved.status, 200);
    assert.match(await (await page(`/cuenta/sitios/${siteId}/preview`, clientB)).text(), new RegExp(assetId));
    assert.doesNotMatch(await (await page("/sitios/taller-laguna", clientB)).text(), new RegExp(assetId));

    const published = await formPost(
      "/api/client/operations",
      {
        action: "content_publish",
        site_id: siteId,
        revision: String(Number(draft.rows[0].revision) + 1),
        idempotency_key: randomUUID(),
      },
      clientB,
    );
    assert.equal(published.status, 200);
    const publicHtml = await (await page("/sitios/taller-laguna", clientB)).text();
    assert.match(publicHtml, /editorial-story-title/);
    const publicPath = publicHtml.match(
      new RegExp(`/media/${assetId}/hero/[0-9a-f]{64}`),
    )?.[0];
    assert.ok(publicPath);
    const publicObject = await fetch(`${baseUrl}${publicPath}`);
    assert.equal(publicObject.status, 200);
    assert.equal(publicObject.headers.get("content-type"), "image/webp");
    assert.match(publicObject.headers.get("cache-control") || "", /immutable/);
    assert.equal(
      (await fetch(`${baseUrl}/media/${assetId}/original/${"a".repeat(64)}`)).status,
      404,
    );
    const editorialPublicationId = (
      await pool.query("SELECT current_publication_id FROM public.sites WHERE id=$1", [siteId])
    ).rows[0].current_publication_id;

    const asset = await pool.query("SELECT version FROM public.media_assets WHERE id=$1", [assetId]);
    const archive = await formPost(
      "/api/media/client",
      {
        action: "archive",
        site_id: siteId,
        asset_id: assetId,
        version: String(asset.rows[0].version),
      },
      clientB,
    );
    assert.equal(archive.status, 422);

    const workspace = await pool.query(
      "SELECT version FROM public.site_template_assignments WHERE site_id=$1",
      [siteId],
    );
    const changed = await formPost(
      "/api/client/operations",
      {
        action: "template_change",
        site_id: siteId,
        template_version_id: "a8888888-8888-4888-8888-888888888888",
        assignment_version: String(workspace.rows[0].version),
        idempotency_key: randomUUID(),
      },
      clientB,
    );
    assert.equal(changed.status, 200);
    assert.equal(
      (await pool.query("SELECT current_publication_id FROM public.sites WHERE id=$1", [siteId]))
        .rows[0].current_publication_id,
      (await pool.query(
        `SELECT id FROM public.site_content_publications
         WHERE site_id=$1 ORDER BY publication_number DESC LIMIT 1`,
        [siteId],
      )).rows[0].id,
    );
    assert.match(
      await (await page("/sitios/taller-laguna", clientB)).text(),
      /editorial-story-title/,
    );

    const modernDraft = await pool.query(
      "SELECT revision FROM public.site_content_drafts WHERE site_id=$1",
      [siteId],
    );
    const modernPublished = await formPost(
      "/api/client/operations",
      {
        action: "content_publish",
        site_id: siteId,
        revision: String(modernDraft.rows[0].revision),
        idempotency_key: randomUUID(),
      },
      clientB,
    );
    assert.equal(modernPublished.status, 200);
    assert.doesNotMatch(
      await (await page("/sitios/taller-laguna", clientB)).text(),
      /editorial-story-title/,
    );

    const editorialRestored = await formPost(
      "/api/client/operations",
      {
        action: "content_restore",
        site_id: siteId,
        publication_id: editorialPublicationId,
        idempotency_key: randomUUID(),
      },
      clientB,
    );
    assert.equal(editorialRestored.status, 200);
    assert.match(
      await (await page("/sitios/taller-laguna", clientB)).text(),
      /editorial-story-title/,
    );

    const restored = await formPost(
      "/api/client/operations",
      {
        action: "content_restore",
        site_id: siteId,
        publication_id: originalPublicationId,
        idempotency_key: randomUUID(),
      },
      clientB,
    );
    assert.equal(restored.status, 200);
    const final = await pool.query(
      `SELECT version.renderer_key
       FROM public.sites site
       JOIN public.site_content_publications publication
         ON publication.id=site.current_publication_id
       JOIN public.template_versions version ON version.id=publication.template_version_id
       WHERE site.id=$1`,
      [siteId],
    );
    assert.equal(final.rows[0].renderer_key, "restaurant-classic-v1");
  } finally {
    await pool.end();
  }
});

test("SVG upload is rejected without paths, object keys or stack traces", async () => {
  const clientB = await login("bruno.demo@example.invalid", clientBPassword);
  const form = new FormData();
  form.set("action", "upload");
  form.set("site_id", "72222222-2222-4222-8222-222222222222");
  form.set("idempotency_key", randomUUID());
  form.set("file", new File(["<svg><script>alert(1)</script></svg>"], "unsafe.svg", {
    type: "image/svg+xml",
  }));
  const response = await formPost("/api/media/client", form, clientB);
  assert.equal(response.status, 422);
  const body = await response.text();
  assert.doesNotMatch(body, /storage_key|C:\\|\/tmp\/|stack|node_modules/i);
});
