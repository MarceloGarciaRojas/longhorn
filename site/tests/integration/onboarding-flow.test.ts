import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { acceptInvitationToken } from "../../src/admin/admin-service.server";
import { createAuthSession } from "../../src/auth/auth-repository.server";
import { createSessionToken, hashSessionToken } from "../../src/auth/security";
import type { AuthSession } from "../../src/auth/types";
import {
  clientContentWorkspace,
  resolvePublicSite,
  saveContentDraft,
} from "../../src/content/service.server";
import { readDatabaseUrl } from "../../src/db/config";
import { createDatabasePool } from "../../src/db/pool";
import {
  adminOnboardingOptions,
  adminCase,
  clientOnboarding,
  convertIntake,
  createManualIntake,
  decideClientApproval,
  generateOnboardingDraft,
  markReadyToPublish,
  OnboardingOperationError,
  publishOnboarding,
  requestClientApproval,
  requestOnboardingInformation,
  reviewIntake,
  saveClientAnswers,
  transitionCase,
  updateCaseOperations,
} from "../../src/onboarding/service.server";
import {
  emptyRestaurantOnboardingAnswers,
  validateRestaurantOnboardingAnswers,
} from "../../src/onboarding/restaurant-onboarding-schema";
import {
  parsePublicIntake,
  submitPublicIntake,
} from "../../src/onboarding/public-service.server";
import { applyMigrations, rollbackAllMigrations } from "../../scripts/db/migrations";
import { seedSyntheticData, SYNTHETIC_DATA } from "../../scripts/db/seed";

process.env.APP_ENV = "test";
process.env.APP_URL = "http://localhost:3000";
process.env.AUTH_PROVIDER = "test";
process.env.AUTH_SECURITY_PEPPER =
  "onboarding-stage-test-pepper-000000000000000000";
process.env.ONBOARDING_PUBLIC_FORM_ENABLED = "true";
process.env.AUTH_TEST_IDENTITIES = JSON.stringify([
  {
    email: "cliente.onboarding@example.invalid",
    password: "synthetic-onboarding-password",
    subject: "test-onboarding-client",
  },
]);

const migrationUrl = readDatabaseUrl("migration");
const applicationUrl = readDatabaseUrl("application");

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

async function fixture(
  input: Pick<
    AuthSession,
    | "userId"
    | "identitySubject"
    | "email"
    | "displayName"
    | "audience"
    | "assuranceLevel"
    | "activeTenantId"
    | "activeTenantName"
  >,
): Promise<AuthSession> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const sessionId = await createAuthSession({
    tokenHash: hashSessionToken(token),
    userId: input.userId,
    identityProvider: "test",
    identitySubject: input.identitySubject,
    audience: input.audience,
    assuranceLevel: input.assuranceLevel,
    activeTenantId: input.activeTenantId,
    expiresAt,
    userAgentHash: null,
    ipHash: null,
  });
  return { ...input, sessionId, identityProvider: "test", expiresAt };
}

function intakeParams(idempotencyKey = randomUUID()) {
  return new URLSearchParams({
    idempotency_key: idempotencyKey,
    business_name: "Restaurante Aurora Ficticio",
    business_category: "restaurant",
    contact_name: "Cliente Onboarding",
    contact_email: " CLIENTE.ONBOARDING@EXAMPLE.INVALID ",
    contact_phone: "+56 9 9876 5432",
    preferred_contact_method: "email",
    city: "Santiago",
    current_digital_presence: "Cuenta social sintética",
    primary_goal: "Publicar carta, contacto y horarios",
    short_notes: "Solicitud ficticia de integración",
    privacy_acknowledgement: "accepted",
  });
}

function completeAnswers() {
  const categoryId = randomUUID();
  const itemId = randomUUID();
  const empty = emptyRestaurantOnboardingAnswers({
    businessName: "Restaurante Aurora Ficticio",
    email: "cliente.onboarding@example.invalid",
    phone: "+56998765432",
    city: "Santiago",
  });
  return validateRestaurantOnboardingAnswers(
    {
      ...empty,
      company: {
        ...empty.company,
        legalName: "Aurora Ficticia SpA",
        tagline: "Sabores de cada estación",
        shortDescription: "Restaurante local de datos completamente sintéticos.",
      },
      objectives: {
        primaryGoal: "Presentar la carta y facilitar el contacto",
        targetAudience: "Personas de la zona",
        desiredTone: "Cercano y claro",
        primaryCallToAction: {
          label: "Ver carta",
          type: "menu",
          target: "#menu",
        },
      },
      about: {
        title: "Nuestra historia",
        description:
          "Un restaurante ficticio creado exclusivamente para validar el onboarding.",
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
            name: "Plato Aurora",
            description: "Preparación sintética de temporada.",
            priceText: "$12.900",
            availability: true,
            order: 0,
            media: null,
          },
        ],
      },
      hours: empty.hours.map((entry) =>
        entry.day === "monday"
          ? {
              ...entry,
              isOpen: true,
              openingTime: "12:00",
              closingTime: "21:00",
            }
          : entry,
      ),
      contact: {
        ...empty.contact,
        address: "Avenida Ficticia 123",
      },
      social: {
        instagram: "https://example.invalid/aurora",
        facebook: "",
        tiktok: "",
      },
      seo: {
        title: "Restaurante Aurora Ficticio",
        description:
          "Carta, horarios y contacto del restaurante ficticio Aurora.",
      },
    },
    "submitted",
  );
}

function onboardingError(code: OnboardingOperationError["code"]) {
  return (error: unknown) =>
    error instanceof OnboardingOperationError && error.code === code;
}

test("Etapa 9A completes an isolated, revision-bound onboarding flow", async (t) => {
  await rollbackAllMigrations(migrationUrl);
  await applyMigrations(migrationUrl);
  await seedSyntheticData(migrationUrl);

  const migrationPool = createDatabasePool({
    connectionString: migrationUrl,
    applicationName: "nexi-onboarding-integration",
    maxConnections: 1,
  });
  t.after(async () => migrationPool.end());

  const admin = await fixture({
    userId: SYNTHETIC_DATA.userAdmin.id,
    identitySubject: SYNTHETIC_DATA.identityAdmin.providerSubject,
    email: SYNTHETIC_DATA.userAdmin.email,
    displayName: SYNTHETIC_DATA.userAdmin.displayName,
    audience: "nexi_admin",
    assuranceLevel: "aal2",
    activeTenantId: null,
    activeTenantName: null,
  });
  const foreignClient = await fixture({
    userId: SYNTHETIC_DATA.userA.id,
    identitySubject: SYNTHETIC_DATA.identityA.providerSubject,
    email: SYNTHETIC_DATA.userA.email,
    displayName: SYNTHETIC_DATA.userA.displayName,
    audience: "client_admin",
    assuranceLevel: "aal1",
    activeTenantId: SYNTHETIC_DATA.tenantA.id,
    activeTenantName: SYNTHETIC_DATA.tenantA.displayName,
  });
  const onboardingOptions = await adminOnboardingOptions(admin);
  assert.equal(
    onboardingOptions.templates.some(
      (template) =>
        template.id === SYNTHETIC_DATA.templateRestaurantEditorialV1.id,
    ),
    false,
  );

  const before = await migrationPool.query<{
    tenants: number;
    users: number;
    sites: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM public.tenants) AS tenants,
       (SELECT count(*)::int FROM public.users) AS users,
       (SELECT count(*)::int FROM public.sites) AS sites`,
  );

  const publicKey = randomUUID();
  const intakeId = await submitPublicIntake(parsePublicIntake(intakeParams(publicKey)));
  assert.equal(
    await submitPublicIntake(parsePublicIntake(intakeParams(publicKey))),
    intakeId,
  );
  const afterIntake = await migrationPool.query<{
    intakes: number;
    tenants: number;
    users: number;
    sites: number;
    email: string;
    supported: boolean;
  }>(
    `SELECT
       (SELECT count(*)::int FROM public.onboarding_intake_requests
         WHERE id=$1) AS intakes,
       (SELECT count(*)::int FROM public.tenants) AS tenants,
       (SELECT count(*)::int FROM public.users) AS users,
       (SELECT count(*)::int FROM public.sites) AS sites,
       contact_email_normalized AS email,supported_category AS supported
     FROM public.onboarding_intake_requests WHERE id=$1`,
    [intakeId],
  );
  assert.deepEqual(
    {
      intakes: afterIntake.rows[0].intakes,
      tenants: afterIntake.rows[0].tenants,
      users: afterIntake.rows[0].users,
      sites: afterIntake.rows[0].sites,
    },
    { intakes: 1, ...before.rows[0] },
  );
  assert.equal(afterIntake.rows[0].email, "cliente.onboarding@example.invalid");
  assert.equal(afterIntake.rows[0].supported, true);

  const unsupportedParams = intakeParams(randomUUID());
  unsupportedParams.set("business_category", "clinic");
  const unsupportedId = await submitPublicIntake(
    parsePublicIntake(unsupportedParams),
  );
  const unsupported = await migrationPool.query<{ supported: boolean }>(
    `SELECT supported_category AS supported
     FROM public.onboarding_intake_requests WHERE id=$1`,
    [unsupportedId],
  );
  assert.equal(unsupported.rows[0].supported, false);
  await reviewIntake(
    admin,
    form({
      intake_id: unsupportedId,
      version: "1",
      target_status: "accepted",
    }),
    "onboarding-unsupported-accepted",
  );
  await assert.rejects(
    convertIntake(
      admin,
      form({
        intake_id: unsupportedId,
        tenant_id: "",
        tenant_slug: "clinica-no-soportada",
        site_slug: "clinica-no-soportada",
        plan_id: SYNTHETIC_DATA.planEssential.id,
        template_version_id: SYNTHETIC_DATA.templateRestaurantV2.id,
        assigned_admin_user_id: SYNTHETIC_DATA.userAdmin.id,
        priority: "normal",
        idempotency_key: randomUUID(),
      }),
      "onboarding-unsupported-conversion",
    ),
    onboardingError("unsupported"),
  );

  const manualId = await createManualIntake(
    admin,
    form({
      source: "whatsapp",
      business_name: "Solicitud Manual Ficticia",
      business_category: "other",
      contact_name: "Contacto Manual",
      contact_email: "manual@example.invalid",
      contact_phone: "",
      preferred_contact_method: "whatsapp",
      city: "",
      current_digital_presence: "Sin presencia",
      primary_goal: "Registrar interés",
      short_notes: "Resumen entregado por canal externo",
      internal_observation: "Nota operativa interna, no visible al cliente.",
      idempotency_key: randomUUID(),
    }),
    "onboarding-manual",
  );
  const manual = await migrationPool.query<{ source: string; notes: number; audit: number }>(
    `SELECT request.source,
       (SELECT count(*)::int FROM public.onboarding_intake_internal_notes
        WHERE intake_request_id=request.id) AS notes,
       (SELECT count(*)::int FROM public.platform_audit_events
        WHERE resource_id=request.id::text
          AND action='onboarding_intake_manual_created') AS audit
     FROM public.onboarding_intake_requests request WHERE request.id=$1`,
    [manualId],
  );
  assert.deepEqual(manual.rows[0], { source: "whatsapp", notes: 1, audit: 1 });

  const failureParams = intakeParams(randomUUID());
  failureParams.set("business_name", "Restaurante Reintento Ficticio");
  failureParams.set("contact_email", "reintento@example.invalid");
  const failureIntakeId = await submitPublicIntake(
    parsePublicIntake(failureParams),
  );
  await reviewIntake(
    admin,
    form({
      intake_id: failureIntakeId,
      version: "1",
      target_status: "accepted",
    }),
    "onboarding-failure-intake-accepted",
  );
  const failureConversion = form({
    intake_id: failureIntakeId,
    tenant_id: "",
    tenant_slug: "restaurante-reintento-ficticio",
    site_slug: "restaurante-reintento-ficticio",
    plan_id: SYNTHETIC_DATA.planEssential.id,
    template_version_id: SYNTHETIC_DATA.templateRestaurantV2.id,
    assigned_admin_user_id: SYNTHETIC_DATA.userAdmin.id,
    priority: "normal",
    idempotency_key: randomUUID(),
  });
  const beforeEditorialAttempt = await migrationPool.query<{
    tenants: number;
    sites: number;
    cases: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM public.tenants) AS tenants,
       (SELECT count(*)::int FROM public.sites) AS sites,
       (SELECT count(*)::int FROM public.onboarding_cases) AS cases`,
  );
  await assert.rejects(
    convertIntake(
      admin,
      form({
        intake_id: failureIntakeId,
        tenant_id: "",
        tenant_slug: "restaurante-editorial-bloqueado",
        site_slug: "restaurante-editorial-bloqueado",
        plan_id: SYNTHETIC_DATA.planEssential.id,
        template_version_id:
          SYNTHETIC_DATA.templateRestaurantEditorialV1.id,
        assigned_admin_user_id: SYNTHETIC_DATA.userAdmin.id,
        priority: "normal",
        idempotency_key: randomUUID(),
      }),
      "onboarding-editorial-blocked",
    ),
    onboardingError("unsupported"),
  );
  assert.deepEqual(
    (await migrationPool.query<{
      tenants: number;
      sites: number;
      cases: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM public.tenants) AS tenants,
         (SELECT count(*)::int FROM public.sites) AS sites,
         (SELECT count(*)::int FROM public.onboarding_cases) AS cases`,
    )).rows[0],
    beforeEditorialAttempt.rows[0],
  );
  await assert.rejects(
    convertIntake(
      admin,
      failureConversion,
      "onboarding-conversion-synthetic-failure",
      { failBeforeInvitationDispatch: true },
    ),
    onboardingError("provider"),
  );
  const recoverable = await migrationPool.query<{
    status: string;
    tenantId: string;
    siteId: string;
    caseId: string;
  }>(
    `SELECT conversion_status AS status,
       converted_tenant_id AS "tenantId",converted_site_id AS "siteId",
       converted_case_id AS "caseId"
     FROM public.onboarding_intake_requests WHERE id=$1`,
    [failureIntakeId],
  );
  assert.equal(recoverable.rows[0].status, "recoverable_failure");
  const recovered = await convertIntake(
    admin,
    failureConversion,
    "onboarding-conversion-retry",
  );
  assert.deepEqual(
    {
      tenantId: recovered.tenantId,
      siteId: recovered.siteId,
      caseId: recovered.caseId,
    },
    {
      tenantId: recoverable.rows[0].tenantId,
      siteId: recoverable.rows[0].siteId,
      caseId: recoverable.rows[0].caseId,
    },
  );

  await assert.rejects(
    reviewIntake(
      foreignClient,
      form({
        intake_id: intakeId,
        version: "1",
        target_status: "accepted",
      }),
      "onboarding-client-admin-denied",
    ),
    onboardingError("denied"),
  );
  await reviewIntake(
    admin,
    form({
      intake_id: intakeId,
      version: "1",
      target_status: "accepted",
    }),
    "onboarding-intake-accepted",
  );

  const conversionForm = form({
    intake_id: intakeId,
    tenant_id: "",
    tenant_slug: "restaurante-aurora-ficticio",
    site_slug: "restaurante-aurora-ficticio",
    plan_id: SYNTHETIC_DATA.planEssential.id,
    template_version_id: SYNTHETIC_DATA.templateRestaurantV2.id,
    assigned_admin_user_id: SYNTHETIC_DATA.userAdmin.id,
    priority: "normal",
    idempotency_key: randomUUID(),
  });
  const converted = await convertIntake(
    admin,
    conversionForm,
    "onboarding-convert",
  );
  assert.ok(converted.acceptanceToken);
  const replay = await convertIntake(
    admin,
    conversionForm,
    "onboarding-convert-replay",
  );
  assert.deepEqual(
    {
      tenantId: replay.tenantId,
      siteId: replay.siteId,
      caseId: replay.caseId,
    },
    {
      tenantId: converted.tenantId,
      siteId: converted.siteId,
      caseId: converted.caseId,
    },
  );
  const resources = await migrationPool.query<{
    tenants: number;
    sites: number;
    cases: number;
    invitations: number;
    assignments: number;
    checklist: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM public.tenants WHERE id=$1) AS tenants,
       (SELECT count(*)::int FROM public.sites WHERE id=$2) AS sites,
       (SELECT count(*)::int FROM public.onboarding_cases WHERE id=$3) AS cases,
       (SELECT count(*)::int FROM public.tenant_invitations WHERE tenant_id=$1) AS invitations,
       (SELECT count(*)::int FROM public.tenant_plan_assignments WHERE tenant_id=$1) AS assignments,
       (SELECT count(*)::int FROM public.onboarding_checklist_items
        WHERE onboarding_case_id=$3) AS checklist`,
    [converted.tenantId, converted.siteId, converted.caseId],
  );
  assert.deepEqual(resources.rows[0], {
    tenants: 1,
    sites: 1,
    cases: 1,
    invitations: 1,
    assignments: 1,
    checklist: 21,
  });

  const accepted = await acceptInvitationToken(
    converted.acceptanceToken!,
    "onboarding-invitation-accepted",
  );
  const client = await fixture({
    userId: accepted.userId,
    identitySubject: "test-onboarding-client",
    email: "cliente.onboarding@example.invalid",
    displayName: "Cliente Onboarding",
    audience: "client_admin",
    assuranceLevel: "aal1",
    activeTenantId: converted.tenantId,
    activeTenantName: "Restaurante Aurora Ficticio",
  });
  const workspace = await clientOnboarding(client, converted.caseId);
  assert.ok(workspace);
  assert.equal(workspace.tenantId, converted.tenantId);
  assert.equal(
    Object.prototype.hasOwnProperty.call(workspace, "assignedAdminName"),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(workspace, "approvalChecksum"),
    false,
  );
  assert.equal(await clientOnboarding(foreignClient, converted.caseId), null);

  let current = await adminCase(admin, converted.caseId);
  assert.ok(current);
  await transitionCase(
    admin,
    form({
      case_id: converted.caseId,
      version: String(current.version),
      target_status: "paused",
      reason: "Pausa sintética",
    }),
    "onboarding-pause",
  );
  await assert.rejects(
    transitionCase(
      admin,
      form({
        case_id: converted.caseId,
        version: String(current.version),
        target_status: "preparing",
      }),
      "onboarding-stale-transition",
    ),
    onboardingError("conflict"),
  );
  current = await adminCase(admin, converted.caseId);
  assert.equal(current?.status, "paused");
  await transitionCase(
    admin,
    form({
      case_id: converted.caseId,
      version: String(current!.version),
      target_status: "pending_review",
    }),
    "onboarding-resume",
  );

  current = await adminCase(admin, converted.caseId);
  await requestOnboardingInformation(
    admin,
    form({
      case_id: converted.caseId,
      version: String(current!.version),
      idempotency_key: randomUUID(),
      message: "Completa la información del restaurante dentro de nexi.",
    }),
    "onboarding-request-information",
  );
  const answers = completeAnswers();
  await saveClientAnswers(
    client,
    form({
      case_id: converted.caseId,
      revision: "0",
      idempotency_key: randomUUID(),
      answers: JSON.stringify(answers),
      submit_for_review: "true",
    }),
    "onboarding-client-answers",
  );
  assert.equal((await resolvePublicSite({ siteSlug: "restaurante-aurora-ficticio" }))
    ?.publicState, "preparing");

  await assert.rejects(
    generateOnboardingDraft(
      admin,
      form({
        case_id: converted.caseId,
        draft_revision: "0",
        idempotency_key: randomUUID(),
      }),
      "onboarding-generate-synthetic-failure",
      { failAfterDraftWrite: true },
    ),
    onboardingError("invalid"),
  );
  assert.equal(
    Number(
      (
        await migrationPool.query<{ count: string }>(
          `SELECT count(*)::text AS count
           FROM public.site_content_drafts WHERE site_id=$1`,
          [converted.siteId],
        )
      ).rows[0].count,
    ),
    0,
  );
  const generated = await generateOnboardingDraft(
    admin,
    form({
      case_id: converted.caseId,
      draft_revision: "0",
      idempotency_key: randomUUID(),
    }),
    "onboarding-generate",
  );
  assert.equal(generated.content.identity.business_name, answers.company.businessName);
  const draftCount = await migrationPool.query<{ drafts: number; publications: number }>(
    `SELECT
       (SELECT count(*)::int FROM public.site_content_drafts WHERE site_id=$1) AS drafts,
       (SELECT count(*)::int FROM public.site_content_publications WHERE site_id=$1) AS publications`,
    [converted.siteId],
  );
  assert.deepEqual(draftCount.rows[0], { drafts: 1, publications: 0 });

  await updateCaseOperations(
    admin,
    form({
      case_id: converted.caseId,
      version: String((await adminCase(admin, converted.caseId))!.version),
      priority: "high",
      assigned_admin_user_id: SYNTHETIC_DATA.userAdmin.id,
      internal_note: "La nota interna nunca debe llegar al DTO cliente.",
      note_idempotency_key: randomUUID(),
    }),
    "onboarding-internal-note",
  );
  const safeAgain = await clientOnboarding(client, converted.caseId);
  assert.ok(safeAgain);
  assert.doesNotMatch(JSON.stringify(safeAgain), /nota interna/i);

  current = await adminCase(admin, converted.caseId);
  await requestClientApproval(
    admin,
    form({
      case_id: converted.caseId,
      version: String(current!.version),
      idempotency_key: randomUUID(),
    }),
    "onboarding-request-approval",
  );
  const clientWorkspace = await clientOnboarding(client, converted.caseId);
  assert.equal(clientWorkspace?.approvalStatus, "pending");
  await decideClientApproval(
    client,
    form({
      case_id: converted.caseId,
      decision: "approve",
      idempotency_key: randomUUID(),
    }),
    "onboarding-client-approve",
  );

  const contentWorkspace = await clientContentWorkspace(client, converted.siteId);
  assert.ok(contentWorkspace?.draft);
  const modifiedContent = structuredClone(contentWorkspace.draft.content);
  modifiedContent.seo.description =
    "Descripción modificada para invalidar la primera aprobación.";
  await saveContentDraft(
    client,
    form({
      site_id: converted.siteId,
      revision: String(contentWorkspace.draft.revision),
      idempotency_key: randomUUID(),
      content_json: JSON.stringify(modifiedContent),
    }),
    "onboarding-invalidate-approval",
  );
  current = await adminCase(admin, converted.caseId);
  assert.equal(current?.status, "preparing");
  assert.equal(current?.approvalStatus, null);
  await assert.rejects(
    markReadyToPublish(
      admin,
      form({
        case_id: converted.caseId,
        version: String(current!.version),
      }),
      "onboarding-stale-approval-blocked",
    ),
    (error: unknown) =>
      error instanceof OnboardingOperationError &&
      ["not_found", "incomplete"].includes(error.code),
  );

  const regenerated = await generateOnboardingDraft(
    admin,
    form({
      case_id: converted.caseId,
      draft_revision: String(contentWorkspace.draft.revision + 1),
      idempotency_key: randomUUID(),
      confirm_replace: "true",
    }),
    "onboarding-regenerate",
  );
  assert.equal(regenerated.draftRevision, contentWorkspace.draft.revision + 2);
  current = await adminCase(admin, converted.caseId);
  await requestClientApproval(
    admin,
    form({
      case_id: converted.caseId,
      version: String(current!.version),
      idempotency_key: randomUUID(),
    }),
    "onboarding-request-approval-2",
  );
  await decideClientApproval(
    client,
    form({
      case_id: converted.caseId,
      decision: "approve",
      idempotency_key: randomUUID(),
    }),
    "onboarding-client-approve-2",
  );
  current = await adminCase(admin, converted.caseId);
  await markReadyToPublish(
    admin,
    form({
      case_id: converted.caseId,
      version: String(current!.version),
    }),
    "onboarding-ready",
  );
  current = await adminCase(admin, converted.caseId);
  const publishForm = form({
    case_id: converted.caseId,
    version: String(current!.version),
    idempotency_key: randomUUID(),
  });
  const concurrentPublishForm = form({
    case_id: converted.caseId,
    version: String(current!.version),
    idempotency_key: randomUUID(),
  });
  await Promise.all([
    publishOnboarding(admin, publishForm, "onboarding-publish"),
    publishOnboarding(
      admin,
      concurrentPublishForm,
      "onboarding-publish-concurrent",
    ),
  ]);
  await publishOnboarding(admin, publishForm, "onboarding-publish-replay");
  const published = await adminCase(admin, converted.caseId);
  assert.equal(published?.status, "published");
  const publicSite = await resolvePublicSite({
    siteSlug: "restaurante-aurora-ficticio",
  });
  assert.equal(publicSite?.publicState, "published");
  assert.equal(publicSite?.content?.identity.business_name, answers.company.businessName);
  const finalCounts = await migrationPool.query<{
    publications: number;
    verified: string;
    messages: number;
    notes: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM public.site_content_publications
        WHERE site_id=$1) AS publications,
       (SELECT status FROM public.onboarding_checklist_items
        WHERE onboarding_case_id=$2 AND item_key='publication_verified') AS verified,
       (SELECT count(*)::int FROM public.support_messages message
        JOIN public.onboarding_cases case_record
          ON case_record.linked_conversation_id=message.conversation_id
        WHERE case_record.id=$2) AS messages,
       (SELECT count(*)::int FROM public.onboarding_internal_notes
        WHERE onboarding_case_id=$2) AS notes`,
    [converted.siteId, converted.caseId],
  );
  assert.deepEqual(finalCounts.rows[0], {
    publications: 1,
    verified: "completed",
    messages: 3,
    notes: 1,
  });

  const roleCheck = await migrationPool.query<{
    appBypass: boolean;
    migratorBypass: boolean;
  }>(
    `SELECT
       (SELECT rolbypassrls FROM pg_roles WHERE rolname='nexi_app') AS "appBypass",
       (SELECT rolbypassrls FROM pg_roles WHERE rolname='nexi_migrator') AS "migratorBypass"`,
  );
  assert.deepEqual(roleCheck.rows[0], {
    appBypass: false,
    migratorBypass: false,
  });
  assert.notEqual(applicationUrl, migrationUrl);
});
