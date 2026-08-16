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

const gymSiteId = "95000000-0000-4000-8000-000000000001";
const gymDraftId = "95000000-0000-4000-8000-000000000002";
const pulsoTemplateVersionId = "a8cccccc-cccc-4ccc-8ccc-cccccccccccc";

function gymPreviewContent(variant = "volt") {
  const categoryId = "95000000-0000-4000-8000-000000000010";
  const classId = "95000000-0000-4000-8000-000000000011";
  return {
    identity: {
      business_name: `Pulso E2E ${variant}`,
      descriptor: "Entrenamiento funcional de prueba",
      logo: null,
    },
    hero: {
      headline: `Entrena con variante ${variant}`,
      subheadline: "Contenido privado y estructurado para validar el preview.",
      primary_cta_label: "Solicitar clase de prueba",
      primary_cta_channel: "contact",
      media: null,
    },
    method: {
      title: "Un metodo progresivo",
      description: "Sesiones guiadas con informacion clara.",
      pillars: [{
        id: "95000000-0000-4000-8000-000000000012",
        title: "Progresion",
        description: "Trabajo adaptado a cada nivel.",
        order: 0,
      }],
    },
    class_categories: [{ id: categoryId, name: "Entrenamiento", order: 0 }],
    classes: [{
      id: classId,
      category_id: categoryId,
      name: "Fuerza total",
      description: "Clase informativa de fuerza.",
      intensity: "high",
      duration_minutes: 60,
      visible: true,
      trial_cta_visible: true,
      order: 0,
      media: null,
    }],
    schedule: [{
      id: "95000000-0000-4000-8000-000000000013",
      class_id: classId,
      trainer_id: null,
      day: "monday",
      start_time: "18:30",
      duration_minutes: 60,
      informational_capacity: null,
      visible: true,
      order: 0,
    }],
    trainers: [],
    plans: [{
      id: "95000000-0000-4000-8000-000000000014",
      name: "Plan informativo",
      price_text: "",
      periodicity: "monthly",
      benefits: ["Acceso a clases"],
      featured: false,
      visible: true,
      order: 0,
    }],
    facilities: [],
    gallery: [],
    location: {
      address_line: "Calle de prueba 123",
      city: "Santiago",
      directions: "",
      map_url: "",
    },
    hours: [{
      day: "monday",
      is_open: true,
      opening_time: "06:30",
      closing_time: "22:00",
      note: "",
    }],
    contact: {
      public_email: "pulso@example.invalid",
      public_phone: "+56 2 2345 6789",
      whatsapp_phone: "",
      social: [],
    },
    seo: {
      title: `Pulso E2E ${variant}`,
      description: "Preview privado de gimnasio para pruebas HTTP.",
    },
    appearance: {
      variant,
      hero_layout: "left",
      method_layout: "right",
      title_scale: "impact",
      media_density: "balanced",
      class_columns: 3,
      spacing: "spacious",
    },
  };
}

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

test("Pulso Club catalog and preview are private while mutations remain blocked", async () => {
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
    await pool.query(
      `INSERT INTO public.sites(id,tenant_id,display_name,slug,status,industry_key)
       VALUES($1,$2,'Pulso HTTP E2E','pulso-http-e2e','preparing','gym')`,
      [gymSiteId, "22222222-2222-4222-8222-222222222222"],
    );
    await pool.query(
      `INSERT INTO public.site_content_drafts(
         id,tenant_id,site_id,schema_key,schema_version,content,revision,
         created_by_user_id,updated_by_user_id,last_idempotency_key
       ) VALUES($1,$2,$3,'gym.v1',1,$4::jsonb,1,$5,$5,$6)`,
      [
        gymDraftId,
        "22222222-2222-4222-8222-222222222222",
        gymSiteId,
        JSON.stringify(gymPreviewContent("volt")),
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        randomUUID(),
      ],
    );

    const catalog = await page(`/cuenta/sitios/${gymSiteId}/plantillas`, clientB);
    const catalogHtml = await catalog.text();
    assert.equal(catalog.status, 200);
    assert.match(catalogHtml, /Pulso Club/);
    assert.match(catalogHtml, /Previsualizar/);
    assert.doesNotMatch(catalogHtml, />Seleccionar</);
    assert.equal((await page(`/cuenta/sitios/${gymSiteId}/plantillas`, clientA)).status, 404);

    const previewPath = `/cuenta/sitios/${gymSiteId}/plantillas/${pulsoTemplateVersionId}/preview`;
    const preview = await page(previewPath, clientB);
    const previewHtml = await preview.text();
    assert.equal(preview.status, 200);
    assert.match(previewHtml, /Entrena con variante volt/);
    assert.match(previewHtml, /Vista previa/);
    assert.match(previewHtml, /noindex/i);
    assert.equal((await page(previewPath, clientA)).status, 404);
    assert.ok([302, 303, 307].includes((await page(previewPath)).status));

    const adminPreview = await page(
      `/nexi-interno/sitios/${gymSiteId}/plantillas/${pulsoTemplateVersionId}/preview`,
      admin,
    );
    assert.equal(adminPreview.status, 200);
    assert.match(await adminPreview.text(), /Entrena con variante volt/);

    const clientSelection = await post(
      "/api/client/operations",
      {
        action: "template_change",
        site_id: gymSiteId,
        template_version_id: pulsoTemplateVersionId,
        assignment_version: "0",
        idempotency_key: randomUUID(),
      },
      clientB,
    );
    assert.equal(clientSelection.status, 422);
    const adminSelection = await post(
      "/api/admin/operations",
      {
        action: "template_assign",
        site_id: gymSiteId,
        template_version_id: pulsoTemplateVersionId,
        idempotency_key: randomUUID(),
      },
      admin,
    );
    assert.equal(adminSelection.status, 403);
    const publication = await post(
      "/api/client/operations",
      {
        action: "content_publish",
        site_id: gymSiteId,
        revision: "1",
        idempotency_key: randomUUID(),
      },
      clientB,
    );
    assert.equal(publication.status, 422);
    const restaurantPublication = await pool.query(
      `SELECT id FROM public.site_content_publications
       WHERE site_id='72222222-2222-4222-8222-222222222222'
       ORDER BY publication_number LIMIT 1`,
    );
    const restoration = await post(
      "/api/client/operations",
      {
        action: "content_restore",
        site_id: gymSiteId,
        publication_id: restaurantPublication.rows[0].id,
        idempotency_key: randomUUID(),
      },
      clientB,
    );
    assert.equal(restoration.status, 422);
    assert.equal(
      (await pool.query(
        `SELECT count(*)::int AS count FROM public.site_template_assignments
         WHERE site_id=$1`,
        [gymSiteId],
      )).rows[0].count,
      0,
    );
    assert.equal((await page("/sitios/pulso-http-e2e")).status, 200);
    assert.match(await (await page("/sitios/pulso-http-e2e")).text(), /preparaci/i);
  } finally {
    await pool.query("DELETE FROM public.site_content_drafts WHERE site_id=$1", [gymSiteId]);
    await pool.query("DELETE FROM public.sites WHERE id=$1", [gymSiteId]);
    await pool.end();
  }
});
