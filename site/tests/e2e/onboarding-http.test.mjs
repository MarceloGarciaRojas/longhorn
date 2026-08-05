import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import test from "node:test";
import pg from "pg";

const { Pool } = pg;
const port = 33_400 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;
const adminPassword = randomBytes(24).toString("base64url");
const clientPassword = randomBytes(24).toString("base64url");
const adminTotp = "639205";
const clientEmail = `onboarding.${randomBytes(5).toString("hex")}@example.invalid`;
const clientSubject = `test-onboarding-${randomBytes(8).toString("hex")}`;
const businessSlug = `restaurante-onboarding-${randomBytes(4).toString("hex")}`;
let server;

function cookieFrom(response) {
  const match = /nexi_session=([^;]+)/.exec(
    response.headers.get("set-cookie") || "",
  );
  assert.ok(match, "missing session cookie");
  return `nexi_session=${match[1]}`;
}

async function waitUntilReady() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {
      // The built server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("onboarding E2E server did not start");
}

async function post(path, values, cookie, origin = baseUrl) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "nexi-onboarding-e2e",
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
  return post("/api/auth/login", {
    audience,
    email,
    password,
    ...(oneTimeCode ? { one_time_code: oneTimeCode } : {}),
  });
}

function intakeValues(idempotencyKey) {
  return {
    idempotency_key: idempotencyKey,
    business_name: "Restaurante HTTP Onboarding",
    business_category: "restaurant",
    contact_name: "Cliente HTTP",
    contact_email: clientEmail.toUpperCase(),
    contact_phone: "+56 9 8765 4321",
    preferred_contact_method: "email",
    city: "Santiago",
    current_digital_presence: "Red social ficticia",
    primary_goal: "Publicar carta y horarios",
    short_notes: "Datos sintéticos del recorrido HTTP",
    privacy_acknowledgement: "accepted",
  };
}

function completeAnswers() {
  const categoryId = randomUUID();
  const itemId = randomUUID();
  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  return {
    company: {
      businessName: "Restaurante HTTP Onboarding",
      tagline: "Sabores del recorrido HTTP",
      shortDescription: "Restaurante ficticio para validación de extremo a extremo.",
      legalName: "",
    },
    objectives: {
      primaryGoal: "Presentar el restaurante",
      targetAudience: "Personas de la zona",
      desiredTone: "Cercano",
      primaryCallToAction: {
        label: "Ver carta",
        type: "menu",
        target: "#menu",
      },
    },
    about: {
      title: "Nuestra historia",
      description: "Historia completamente sintética para la prueba HTTP.",
    },
    menu: {
      sectionTitle: "Nuestra carta",
      categories: [
        { id: categoryId, name: "Principales", description: "", order: 0 },
      ],
      items: [
        {
          id: itemId,
          categoryId,
          name: "Plato HTTP",
          description: "Preparación ficticia para pruebas.",
          priceText: "$10.900",
          availability: true,
          order: 0,
          media: null,
        },
      ],
    },
    hours: days.map((day, index) => ({
      day,
      isOpen: index === 0,
      openingTime: index === 0 ? "12:00" : "",
      closingTime: index === 0 ? "20:00" : "",
      note: "",
    })),
    contact: {
      publicEmail: clientEmail,
      publicPhone: "+56987654321",
      whatsappPhone: "",
      address: "Calle HTTP 123",
      city: "Santiago",
      mapUrl: "",
    },
    social: { instagram: "", facebook: "", tiktok: "" },
    seo: {
      title: "Restaurante HTTP Onboarding",
      description: "Carta y horarios del restaurante ficticio de la prueba HTTP.",
    },
    media: { hero: null },
  };
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
        AUTH_SECURITY_PEPPER: randomBytes(32).toString("base64url"),
        ONBOARDING_PUBLIC_FORM_ENABLED: "true",
        ONBOARDING_PUBLIC_RATE_LIMIT: "5",
        AUTH_TEST_IDENTITIES: JSON.stringify([
          {
            email: "admin.nexi@example.invalid",
            password: adminPassword,
            subject: "test-admin",
            oneTimeCode: adminTotp,
          },
          {
            email: clientEmail,
            password: clientPassword,
            subject: clientSubject,
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

test("public request becomes a verified publication through protected HTTP routes", async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_MIGRATION_URL,
    max: 1,
  });
  try {
    const landing = await page("/");
    assert.equal(landing.status, 200);
    assert.match(await landing.text(), /href="\/comenzar"/);
    const begin = await page("/comenzar");
    assert.equal(begin.status, 200);
    assert.match(await begin.text(), /solicitud de incorporaci/i);

    const rejectedOrigin = await post(
      "/api/onboarding/public",
      intakeValues(randomUUID()),
      undefined,
      "https://attacker.invalid",
    );
    assert.equal(rejectedOrigin.status, 403);

    const beforeHoneypot = await pool.query(
      "SELECT count(*)::int AS count FROM public.onboarding_intake_requests",
    );
    const honeypot = await post("/api/onboarding/public", {
      ...intakeValues(randomUUID()),
      website: "bot.invalid",
    });
    assert.equal(honeypot.status, 303);
    const afterHoneypot = await pool.query(
      "SELECT count(*)::int AS count FROM public.onboarding_intake_requests",
    );
    assert.equal(afterHoneypot.rows[0].count, beforeHoneypot.rows[0].count);

    const countsBefore = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM public.tenants) tenants,
         (SELECT count(*)::int FROM public.users) users,
         (SELECT count(*)::int FROM public.sites) sites`,
    );
    const intakeKey = randomUUID();
    const submitted = await post(
      "/api/onboarding/public",
      intakeValues(intakeKey),
    );
    assert.equal(submitted.status, 303);
    assert.equal(
      new URL(submitted.headers.get("location")).searchParams.get("status"),
      "received",
    );
    assert.equal(
      (
        await post("/api/onboarding/public", intakeValues(intakeKey))
      ).status,
      303,
    );
    const intake = await pool.query(
      `SELECT id,version,contact_email_normalized,supported_category
       FROM public.onboarding_intake_requests
       WHERE idempotency_key=$1`,
      [intakeKey],
    );
    assert.equal(intake.rowCount, 1);
    assert.equal(intake.rows[0].contact_email_normalized, clientEmail);
    assert.equal(intake.rows[0].supported_category, true);
    const countsAfter = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM public.tenants) tenants,
         (SELECT count(*)::int FROM public.users) users,
         (SELECT count(*)::int FROM public.sites) sites`,
    );
    assert.deepEqual(countsAfter.rows[0], countsBefore.rows[0]);

    const withoutMfa = await login(
      "nexi_admin",
      "admin.nexi@example.invalid",
      adminPassword,
    );
    assert.equal(
      new URL(withoutMfa.headers.get("location")).searchParams.get("error"),
      "mfa",
    );
    const adminLogin = await login(
      "nexi_admin",
      "admin.nexi@example.invalid",
      adminPassword,
      adminTotp,
    );
    const adminCookie = cookieFrom(adminLogin);
    const adminPage = await page("/nexi-interno/onboarding", adminCookie);
    assert.equal(adminPage.status, 200);
    assert.match(await adminPage.text(), /Restaurante HTTP Onboarding/);

    const accepted = await post(
      "/api/onboarding/admin",
      {
        action: "intake_review",
        intake_id: intake.rows[0].id,
        version: String(intake.rows[0].version),
        target_status: "accepted",
      },
      adminCookie,
    );
    assert.equal(accepted.status, 303);

    const converted = await post(
      "/api/onboarding/admin",
      {
        action: "intake_convert",
        intake_id: intake.rows[0].id,
        tenant_id: "",
        tenant_slug: businessSlug,
        site_slug: businessSlug,
        plan_id: "61111111-1111-4111-8111-111111111111",
        template_version_id: "a8666666-6666-4666-8666-666666666666",
        assigned_admin_user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        priority: "normal",
        idempotency_key: randomUUID(),
      },
      adminCookie,
    );
    assert.equal(converted.status, 303);
    const convertedLocation = new URL(converted.headers.get("location"));
    const token = convertedLocation.searchParams.get("synthetic");
    assert.ok(token);
    const caseMatch = /\/casos\/([0-9a-f-]{36})/.exec(
      convertedLocation.pathname,
    );
    assert.ok(caseMatch);
    const caseId = caseMatch[1];
    const convertedRows = await pool.query(
      `SELECT tenant_id,site_id FROM public.onboarding_cases WHERE id=$1`,
      [caseId],
    );
    const tenantId = convertedRows.rows[0].tenant_id;
    const siteId = convertedRows.rows[0].site_id;

    const invitation = await post("/api/invitations/accept", { token });
    assert.equal(invitation.status, 303);
    assert.equal(
      new URL(invitation.headers.get("location")).searchParams.get("status"),
      "accepted",
    );
    const clientLogin = await login(
      "client_admin",
      clientEmail,
      clientPassword,
    );
    const clientCookie = cookieFrom(clientLogin);
    const onboardingPage = await page(
      `/cuenta/incorporacion/${caseId}`,
      clientCookie,
    );
    const onboardingHtml = await onboardingPage.text();
    assert.equal(onboardingPage.status, 200);
    assert.match(onboardingHtml, /Incorporaci/i);
    assert.doesNotMatch(onboardingHtml, /Prioridad|Responsable|checksum|tenant_id/i);

    const answers = await post(
      "/api/onboarding/client",
      {
        action: "answers_save",
        case_id: caseId,
        revision: "0",
        idempotency_key: randomUUID(),
        answers: JSON.stringify(completeAnswers()),
        submit_for_review: "true",
      },
      clientCookie,
    );
    assert.equal(answers.status, 303);

    let current = await pool.query(
      `SELECT version,status FROM public.onboarding_cases WHERE id=$1`,
      [caseId],
    );
    assert.equal(current.rows[0].status, "internal_review");
    assert.equal(
      (
        await post(
          "/api/onboarding/admin",
          {
            action: "generate_draft",
            case_id: caseId,
            draft_revision: "0",
            idempotency_key: randomUUID(),
          },
          adminCookie,
        )
      ).status,
      303,
    );
    const preview = await page(`/cuenta/sitios/${siteId}/preview`, clientCookie);
    const previewHtml = await preview.text();
    assert.equal(preview.status, 200);
    assert.match(previewHtml, /Restaurante HTTP Onboarding/);
    assert.match(previewHtml, /noindex/i);

    current = await pool.query(
      `SELECT version FROM public.onboarding_cases WHERE id=$1`,
      [caseId],
    );
    await post(
      "/api/onboarding/admin",
      {
        action: "request_approval",
        case_id: caseId,
        version: String(current.rows[0].version),
        idempotency_key: randomUUID(),
      },
      adminCookie,
    );
    const approvalPage = await page(
      `/cuenta/incorporacion/${caseId}`,
      clientCookie,
    );
    assert.match(await approvalPage.text(), /Aprobar esta revisi/i);
    assert.equal(
      (
        await post(
          "/api/onboarding/client",
          {
            action: "approval_decide",
            case_id: caseId,
            decision: "approve",
            idempotency_key: randomUUID(),
          },
          clientCookie,
        )
      ).status,
      303,
    );

    current = await pool.query(
      `SELECT version FROM public.onboarding_cases WHERE id=$1`,
      [caseId],
    );
    await post(
      "/api/onboarding/admin",
      {
        action: "mark_ready",
        case_id: caseId,
        version: String(current.rows[0].version),
      },
      adminCookie,
    );
    current = await pool.query(
      `SELECT version,status FROM public.onboarding_cases WHERE id=$1`,
      [caseId],
    );
    assert.equal(current.rows[0].status, "ready_to_publish");
    const published = await post(
      "/api/onboarding/admin",
      {
        action: "publish",
        case_id: caseId,
        version: String(current.rows[0].version),
        idempotency_key: randomUUID(),
      },
      adminCookie,
    );
    assert.equal(published.status, 303);
    const publicPage = await page(`/sitios/${businessSlug}`);
    const publicHtml = await publicPage.text();
    assert.equal(publicPage.status, 200);
    assert.match(publicHtml, /Restaurante HTTP Onboarding/);
    assert.doesNotMatch(publicHtml, /noindex/i);
    const closed = await pool.query(
      `SELECT case_record.status,
         (SELECT count(*)::int FROM public.site_content_publications
          WHERE site_id=case_record.site_id) AS publications,
         (SELECT status FROM public.onboarding_checklist_items
          WHERE onboarding_case_id=case_record.id
            AND item_key='publication_verified') AS verified
       FROM public.onboarding_cases case_record WHERE case_record.id=$1`,
      [caseId],
    );
    assert.deepEqual(closed.rows[0], {
      status: "published",
      publications: 1,
      verified: "completed",
    });

    const rateResponses = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      rateResponses.push(
        await post(
          "/api/onboarding/public",
          intakeValues(randomUUID()),
        ),
      );
    }
    assert.deepEqual(
      rateResponses.map((response) => response.status),
      [303, 303, 303, 429],
    );
    assert.ok(tenantId);
  } finally {
    await pool.end();
  }
});
