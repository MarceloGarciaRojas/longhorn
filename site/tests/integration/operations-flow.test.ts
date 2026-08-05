import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  createAuthSession,
} from "../../src/auth/auth-repository.server";
import { createSessionToken, hashSessionToken } from "../../src/auth/security";
import type { AuthSession } from "../../src/auth/types";
import { readDatabaseUrl } from "../../src/db/config";
import { createDatabasePool } from "../../src/db/pool";
import { withClientOperation } from "../../src/operations/contexts.server";
import { handleAdminOperation, handleClientOperation } from "../../src/operations/http.server";
import { canUseSyntheticNotificationAdapter } from "../../src/operations/notification-adapter";
import {
  adminAssignDomain,
  adminConversation,
  adminCreateSite,
  adminReply,
  adminReviewDeletion,
  adminSite,
  adminSiteDomains,
  adminUnreadCount,
  cancelDeletion,
  clientConversation,
  clientConversationStatus,
  clientReply,
  clientSite,
  clientSites,
  clientUnreadCount,
  createConversation,
  deliverSyntheticNotifications,
  requestDeletion,
  requestDomain,
} from "../../src/operations/service.server";
import { OperationValidationError } from "../../src/operations/validation";
import {
  applyMigrations,
  rollbackAllMigrations,
} from "../../scripts/db/migrations";
import { seedSyntheticData, SYNTHETIC_DATA } from "../../scripts/db/seed";

const migrationUrl = readDatabaseUrl("migration");
const applicationUrl = readDatabaseUrl("application");
const appUrl = "http://localhost:3000";

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

async function fixture(
  input: Pick<AuthSession, "userId" | "identitySubject" | "email" | "displayName" |
    "audience" | "assuranceLevel" | "activeTenantId" | "activeTenantName">,
): Promise<{ token: string; session: AuthSession }> {
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
  return {
    token,
    session: { ...input, sessionId, identityProvider: "test", expiresAt },
  };
}

function operationRequest(
  path: string,
  token: string,
  values: Record<string, string>,
  origin = appUrl,
): Request {
  return new Request(`${appUrl}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      cookie: `nexi_session=${token}`,
      origin,
    },
    body: new URLSearchParams(values),
  });
}

test("Etapa 7B operations remain tenant-safe, auditable and reversible", async (t) => {
  await rollbackAllMigrations(migrationUrl);
  await applyMigrations(migrationUrl);
  await seedSyntheticData(migrationUrl);
  const migrationPool = createDatabasePool({
    connectionString: migrationUrl,
    applicationName: "nexi-operations-tests",
    maxConnections: 1,
  });
  const appPool = createDatabasePool({
    connectionString: applicationUrl,
    applicationName: "nexi-operations-app-role-tests",
    maxConnections: 1,
  });
  t.after(async () => {
    await migrationPool.end();
    await appPool.end();
  });

  const [clientA, clientB, admin] = await Promise.all([
    fixture({
      userId: SYNTHETIC_DATA.userA.id,
      identitySubject: SYNTHETIC_DATA.identityA.providerSubject,
      email: SYNTHETIC_DATA.userA.email,
      displayName: SYNTHETIC_DATA.userA.displayName,
      audience: "client_admin",
      assuranceLevel: "aal1",
      activeTenantId: SYNTHETIC_DATA.tenantA.id,
      activeTenantName: SYNTHETIC_DATA.tenantA.displayName,
    }),
    fixture({
      userId: SYNTHETIC_DATA.userB.id,
      identitySubject: SYNTHETIC_DATA.identityB.providerSubject,
      email: SYNTHETIC_DATA.userB.email,
      displayName: SYNTHETIC_DATA.userB.displayName,
      audience: "client_admin",
      assuranceLevel: "aal1",
      activeTenantId: SYNTHETIC_DATA.tenantB.id,
      activeTenantName: SYNTHETIC_DATA.tenantB.displayName,
    }),
    fixture({
      userId: SYNTHETIC_DATA.userAdmin.id,
      identitySubject: SYNTHETIC_DATA.identityAdmin.providerSubject,
      email: SYNTHETIC_DATA.userAdmin.email,
      displayName: SYNTHETIC_DATA.userAdmin.displayName,
      audience: "nexi_admin",
      assuranceLevel: "aal2",
      activeTenantId: null,
      activeTenantName: null,
    }),
  ]);

  await t.test("only AAL2 nexi_admin creates an idempotent site", async () => {
    const key = randomUUID();
    const siteForm = form({
      tenant_id: SYNTHETIC_DATA.tenantB.id,
      display_name: "Sitio Operación Ficticio",
      slug: "sitio-operacion-ficticio",
      idempotency_key: key,
    });
    const siteId = await adminCreateSite(admin.session, siteForm, "site-create-a");
    assert.equal(
      await adminCreateSite(admin.session, siteForm, "site-create-b"),
      siteId,
    );
    assert.equal((await adminSite(admin.session, siteId))?.status, "preparing");
    await assert.rejects(
      adminCreateSite(clientA.session, siteForm, "client-create-denied"),
      (error: unknown) =>
        error instanceof OperationValidationError && error.code === "denied",
    );
    await assert.rejects(
      adminCreateSite(
        admin.session,
        form({
          tenant_id: randomUUID(),
          display_name: "Tenant inexistente",
          slug: "tenant-inexistente",
          idempotency_key: randomUUID(),
        }),
        "invalid-tenant",
      ),
      (error: unknown) =>
        error instanceof OperationValidationError && error.code === "not_found",
    );
    await assert.rejects(
      adminCreateSite(
        admin.session,
        form({
          tenant_id: SYNTHETIC_DATA.tenantB.id,
          display_name: "Slug duplicado",
          slug: "sitio-operacion-ficticio",
          idempotency_key: randomUUID(),
        }),
        "duplicate-slug",
      ),
      (error: unknown) =>
        error instanceof OperationValidationError && error.code === "duplicate",
    );
    await assert.rejects(
      appPool.query("UPDATE public.sites SET tenant_id=$1 WHERE id=$2", [
        SYNTHETIC_DATA.tenantA.id,
        siteId,
      ]),
      (error: unknown) => (error as { code?: string }).code === "42501",
    );
  });

  await t.test("client site reads are isolated by active tenant and UUID", async () => {
    const visible = await clientSites(clientA.session);
    assert.ok(visible.every((site) => site.tenantId === SYNTHETIC_DATA.tenantA.id));
    assert.equal(await clientSite(clientA.session, SYNTHETIC_DATA.siteB2.id), null);
    assert.equal(
      (await clientSite(clientA.session, SYNTHETIC_DATA.siteA2.id))?.status,
      "active",
    );
  });

  await t.test("deletion waits, cancels, approves and archives without DELETE", async () => {
    const firstKey = randomUUID();
    const requestForm = form({
      site_id: SYNTHETIC_DATA.siteA2.id,
      reason: "Solicitud de prueba completamente ficticia.",
      idempotency_key: firstKey,
    });
    assert.equal(
      await requestDeletion(clientA.session, requestForm, "delete-request-a"),
      SYNTHETIC_DATA.siteA2.id,
    );
    assert.equal(
      await requestDeletion(clientA.session, requestForm, "delete-request-b"),
      SYNTHETIC_DATA.siteA2.id,
    );
    const created = await migrationPool.query<{
      id: string;
      requestedAt: Date;
      eligibleAt: Date;
    }>(
      `SELECT id,requested_at AS "requestedAt",eligible_at AS "eligibleAt"
       FROM public.site_deletion_requests
       WHERE site_id=$1 AND idempotency_key=$2`,
      [SYNTHETIC_DATA.siteA2.id, firstKey],
    );
    assert.equal(created.rowCount, 1);
    assert.equal(
      Math.round(
        (created.rows[0].eligibleAt.getTime() -
          created.rows[0].requestedAt.getTime()) /
          3_600_000,
      ),
      48,
    );
    await assert.rejects(
      requestDeletion(
        clientA.session,
        form({
          site_id: SYNTHETIC_DATA.siteA2.id,
          reason: "Segunda solicitud activa ficticia.",
          idempotency_key: randomUUID(),
        }),
        "delete-duplicate",
      ),
      (error: unknown) =>
        error instanceof OperationValidationError && error.code === "duplicate",
    );
    const cancelForm = form({ request_id: created.rows[0].id });
    await cancelDeletion(clientA.session, cancelForm, "delete-cancel-a");
    await cancelDeletion(clientA.session, cancelForm, "delete-cancel-b");

    const secondKey = randomUUID();
    await requestDeletion(
      clientA.session,
      form({
        site_id: SYNTHETIC_DATA.siteA2.id,
        reason: "Nueva solicitud para probar el archivado.",
        idempotency_key: secondKey,
      }),
      "delete-request-second",
    );
    const second = await migrationPool.query<{ id: string }>(
      "SELECT id FROM public.site_deletion_requests WHERE idempotency_key=$1",
      [secondKey],
    );
    await adminReviewDeletion(
      admin.session,
      form({
        request_id: second.rows[0].id,
        target_status: "approved",
        review_note: "Aprobación sintética controlada.",
      }),
      "delete-approve",
    );
    await assert.rejects(
      adminReviewDeletion(
        admin.session,
        form({
          request_id: second.rows[0].id,
          target_status: "executed",
          review_note: "Intento anticipado sintético.",
        }),
        "delete-too-early",
      ),
      (error: unknown) =>
        error instanceof OperationValidationError && error.code === "too_early",
    );
    await migrationPool.query(
      "UPDATE public.site_deletion_requests SET eligible_at=requested_at+interval '1 millisecond' WHERE id=$1",
      [second.rows[0].id],
    );
    const executeForm = form({
      request_id: second.rows[0].id,
      target_status: "executed",
      review_note: "Archivado sintético elegible.",
    });
    await adminReviewDeletion(admin.session, executeForm, "delete-execute-a");
    await adminReviewDeletion(admin.session, executeForm, "delete-execute-b");
    const preserved = await migrationPool.query<{ status: string; events: string }>(
      `SELECT site.status,
         (SELECT count(*)::text FROM public.platform_audit_events
          WHERE action='site_archived' AND resource_id=site.id::text) AS events
       FROM public.sites site WHERE site.id=$1`,
      [SYNTHETIC_DATA.siteA2.id],
    );
    assert.equal(preserved.rows[0].status, "archived");
    assert.equal(preserved.rows[0].events, "1");
  });

  await t.test("domain requests use plan capabilities and registry constraints", async () => {
    await assert.rejects(
      requestDomain(
        clientA.session,
        form({
          site_id: SYNTHETIC_DATA.siteA.id,
          request_type: "advice_required",
          idempotency_key: randomUUID(),
        }),
        "essential-domain-denied",
      ),
      (error: unknown) =>
        error instanceof OperationValidationError && error.code === "plan",
    );
    const key = randomUUID();
    const domainRequestForm = form({
      site_id: SYNTHETIC_DATA.siteB2.id,
      request_type: "register_new",
      desired_domain: "laguna-operacion.cl",
      alternatives: "laguna-operacion-2.cl",
      notes: "Solicitud ficticia.",
      idempotency_key: key,
    });
    await requestDomain(clientB.session, domainRequestForm, "domain-request-a");
    await requestDomain(clientB.session, domainRequestForm, "domain-request-b");
    assert.equal(
      (
        await migrationPool.query(
          "SELECT 1 FROM public.site_domain_requests WHERE idempotency_key=$1",
          [key],
        )
      ).rowCount,
      1,
    );
    const assignment = form({
      site_id: SYNTHETIC_DATA.siteB2.id,
      hostname: "laguna-operacion.nexi.cl",
      domain_type: "nexi_subdomain",
    });
    await adminAssignDomain(admin.session, assignment, "domain-assign-a");
    await adminAssignDomain(admin.session, assignment, "domain-assign-b");
    await assert.rejects(
      adminAssignDomain(
        admin.session,
        form({
          site_id: SYNTHETIC_DATA.siteB.id,
          hostname: "laguna-operacion.nexi.cl",
          domain_type: "nexi_subdomain",
        }),
        "domain-host-duplicate",
      ),
      (error: unknown) =>
        error instanceof OperationValidationError && error.code === "duplicate",
    );
    await adminAssignDomain(
      admin.session,
      form({
        site_id: SYNTHETIC_DATA.siteB2.id,
        hostname: "laguna-operacion.cl",
        domain_type: "custom_domain",
      }),
      "custom-domain-register",
    );
    const domains = await adminSiteDomains(admin.session, SYNTHETIC_DATA.siteB2.id);
    assert.equal(domains.filter((domain) => domain.isPrimary).length, 1);
    await assert.rejects(
      migrationPool.query(
        `INSERT INTO public.site_domains(
           tenant_id,site_id,hostname,domain_type,status,is_primary,verification_status
         ) VALUES($1,$2,'tenant-incorrecto.example','custom_domain','pending',false,'unverified')`,
        [SYNTHETIC_DATA.tenantA.id, SYNTHETIC_DATA.siteB2.id],
      ),
      (error: unknown) => (error as { code?: string }).code === "23514",
    );
  });

  let conversationId = "";
  await t.test("messages are tenant-scoped, immutable, idempotent and unread", async () => {
    const conversationKey = randomUUID();
    const conversationForm = form({
      subject: "Conversación operativa ficticia",
      category: "general",
      body: "Primer mensaje interno completamente ficticio.",
      idempotency_key: conversationKey,
      message_idempotency_key: randomUUID(),
    });
    conversationId = await createConversation(
      clientA.session,
      conversationForm,
      "conversation-create-a",
    );
    assert.equal(
      await createConversation(
        clientA.session,
        conversationForm,
        "conversation-create-b",
      ),
      conversationId,
    );
    assert.equal(await clientConversation(clientB.session, conversationId), null);
    const beforeAdminRead = await adminUnreadCount(admin.session);
    assert.ok(beforeAdminRead > 0);
    await adminConversation(admin.session, conversationId);
    const messageKey = randomUUID();
    const replyForm = form({
      conversation_id: conversationId,
      body: "Respuesta sintética del equipo nexi.",
      idempotency_key: messageKey,
    });
    await adminReply(admin.session, replyForm, "admin-reply-a");
    await adminReply(admin.session, replyForm, "admin-reply-b");
    assert.equal(
      (
        await migrationPool.query(
          "SELECT 1 FROM public.support_messages WHERE idempotency_key=$1",
          [messageKey],
        )
      ).rowCount,
      1,
    );
    const unreadBefore = await clientUnreadCount(clientA.session);
    await clientConversation(clientA.session, conversationId);
    assert.ok((await clientUnreadCount(clientA.session)) < unreadBefore);
    const clientMessageKey = randomUUID();
    const clientReplyForm = form({
      conversation_id: conversationId,
      body: "Respuesta ficticia del cliente.",
      idempotency_key: clientMessageKey,
    });
    await clientReply(clientA.session, clientReplyForm, "client-reply-a");
    await clientReply(clientA.session, clientReplyForm, "client-reply-b");
    assert.equal(
      (
        await migrationPool.query(
          "SELECT 1 FROM public.support_messages WHERE idempotency_key=$1",
          [clientMessageKey],
        )
      ).rowCount,
      1,
    );
    await assert.rejects(
      clientReply(
        clientA.session,
        form({
          conversation_id: conversationId,
          body: "",
          idempotency_key: randomUUID(),
        }),
        "empty-message",
      ),
      OperationValidationError,
    );
    await assert.rejects(
      clientReply(
        clientA.session,
        form({
          conversation_id: conversationId,
          body: "x".repeat(4001),
          idempotency_key: randomUUID(),
        }),
        "long-message",
      ),
      OperationValidationError,
    );
    const storedMessage = await migrationPool.query<{ id: string }>(
      "SELECT id FROM public.support_messages WHERE idempotency_key=$1",
      [clientMessageKey],
    );
    await assert.rejects(
      migrationPool.query(
        "UPDATE public.support_messages SET body='editado' WHERE id=$1",
        [storedMessage.rows[0].id],
      ),
      (error: unknown) => (error as { code?: string }).code === "42501",
    );
    await assert.rejects(
      withClientOperation(clientA.session, "priority-denied", (client) =>
        client.query(
          "UPDATE public.support_conversations SET priority='urgent' WHERE id=$1",
          [conversationId],
        ),
      ),
      (error: unknown) => (error as { code?: string }).code === "42501",
    );
    const stateForm = (target: string) =>
      form({ conversation_id: conversationId, target_status: target });
    await clientConversationStatus(clientA.session, stateForm("closed"), "close-a");
    await clientConversationStatus(clientA.session, stateForm("closed"), "close-b");
    await clientConversationStatus(clientA.session, stateForm("open"), "reopen-a");
    assert.equal(
      (await clientConversation(clientA.session, conversationId))?.conversation.status,
      "open",
    );
  });

  await t.test("outbox is safe, deduplicated and synthetic-only", async () => {
    const outbox = await migrationPool.query<{
      payload: Record<string, unknown>;
      count: string;
    }>(
      `SELECT payload,
         count(*) OVER (PARTITION BY deduplication_key)::text AS count
       FROM public.notification_outbox
       WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [SYNTHETIC_DATA.tenantA.id],
    );
    assert.equal(outbox.rows[0].count, "1");
    assert.deepEqual(
      Object.keys(outbox.rows[0].payload).sort(),
      ["path"],
    );
    assert.equal(JSON.stringify(outbox.rows[0].payload).includes("Respuesta"), false);
    assert.equal(canUseSyntheticNotificationAdapter("test"), true);
    assert.equal(canUseSyntheticNotificationAdapter("local"), true);
    assert.equal(canUseSyntheticNotificationAdapter("production"), false);
    assert.ok((await deliverSyntheticNotifications(admin.session, "outbox-deliver")) > 0);
  });

  await t.test("HTTP mutations reject invalid origin, client admin and missing AAL2", async () => {
    const invalidOrigin = await handleClientOperation(
      operationRequest(
        "/api/client/operations",
        clientA.token,
        { action: "conversation_status" },
        "https://attacker.invalid",
      ),
    );
    assert.equal(invalidOrigin.status, 403);
    const clientInAdmin = await handleAdminOperation(
      operationRequest("/api/admin/operations", clientA.token, {
        action: "site_create",
      }),
    );
    assert.equal(clientInAdmin.status, 401);
    await assert.rejects(
      adminCreateSite(
        { ...admin.session, assuranceLevel: "aal1" },
        form({
          tenant_id: SYNTHETIC_DATA.tenantB.id,
          display_name: "Sin segundo factor",
          slug: "sin-segundo-factor",
          idempotency_key: randomUUID(),
        }),
        "missing-aal2",
      ),
      (error: unknown) =>
        error instanceof OperationValidationError && error.code === "denied",
    );
  });
});
