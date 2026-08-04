import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import {
  createAuthSession,
  readAuthSession,
  revokeAuthSession,
} from "../../src/auth/auth-repository.server";
import {
  acceptInvitationToken,
  createInvitationFromForm,
  createTenantFromForm,
  resendInvitationFromForm,
} from "../../src/admin/admin-service.server";
import {
  createTenant,
  completeInvitation,
  getTenant,
  listAudit,
  listInvitations,
  listMemberships,
  listTenants,
  readDashboard,
  reserveInvitation,
  revokeInvitation,
  setMembershipStatus,
  setTenantStatus,
  updateTenant,
} from "../../src/admin/admin-repository.server";
import { TestIdentityProvider } from "../../src/auth/test-identity-provider.server";
import { requestFingerprint } from "../../src/admin/validation";
import { readDatabaseUrl } from "../../src/db/config";
import { createDatabasePool } from "../../src/db/pool";
import { SYNTHETIC_DATA } from "../../scripts/db/seed";

process.env.APP_ENV = "test";
process.env.APP_URL = "http://localhost:3000";
process.env.AUTH_PROVIDER = "test";
process.env.AUTH_SECURITY_PEPPER =
  "admin-stage-test-pepper-000000000000000000000";

const invitedEmail = "invitada.etapa6@example.invalid";
const invitedSubject = "test-invited-stage-6";
process.env.AUTH_TEST_IDENTITIES = JSON.stringify([
  {
    email: invitedEmail,
    password: "synthetic-password-only",
    subject: invitedSubject,
  },
  {
    email: SYNTHETIC_DATA.userA.email,
    password: "synthetic-existing-only",
    subject: SYNTHETIC_DATA.identityA.providerSubject,
  },
]);

function tokenHash(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

async function sessionFor(input: {
  userId: string;
  subject: string;
  audience: "client_admin" | "nexi_admin";
  assuranceLevel: "aal1" | "aal2";
  tenantId: string | null;
}) {
  const token = randomBytes(32).toString("base64url");
  const sessionId = await createAuthSession({
    tokenHash: tokenHash(token),
    userId: input.userId,
    identityProvider: "test",
    identitySubject: input.subject,
    audience: input.audience,
    assuranceLevel: input.assuranceLevel,
    activeTenantId: input.tenantId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    userAgentHash: null,
    ipHash: null,
  });
  return { token, sessionId, userId: input.userId };
}

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

test("nexi admin back office enforces lifecycle, invitations and scoped access", async (t) => {
  const testStartedAt = new Date();
  let tenantId = "";
  const migrationUrl = readDatabaseUrl("migration");
  const migrationPool = createDatabasePool({
    connectionString: migrationUrl,
    applicationName: "nexi-admin-tests",
    maxConnections: 1,
  });
  t.after(async () => {
    try {
      if (tenantId) {
        await migrationPool.query("BEGIN");
        await migrationPool.query(
          `DELETE FROM public.platform_idempotency_keys
           WHERE result_resource_id = $1
              OR result_resource_id IN (
                SELECT id FROM public.tenant_invitations WHERE tenant_id = $1
              )`,
          [tenantId],
        );
        await migrationPool.query(
          "DELETE FROM public.platform_audit_events WHERE tenant_id = $1",
          [tenantId],
        );
        await migrationPool.query(
          "DELETE FROM public.tenant_invitations WHERE tenant_id = $1",
          [tenantId],
        );
        await migrationPool.query(
          "DELETE FROM public.auth_sessions WHERE active_tenant_id = $1 OR created_at >= $2",
          [tenantId, testStartedAt],
        );
        await migrationPool.query(
          "DELETE FROM public.tenant_memberships WHERE tenant_id = $1",
          [tenantId],
        );
        await migrationPool.query(
          `DELETE FROM public.auth_identities
           WHERE user_id IN (
             SELECT id FROM public.users WHERE email = $1
           )`,
          [invitedEmail],
        );
        await migrationPool.query(
          "DELETE FROM public.users WHERE email = $1",
          [invitedEmail],
        );
        await migrationPool.query(
          "DELETE FROM public.tenants WHERE id = $1",
          [tenantId],
        );
        await migrationPool.query("COMMIT");
      }
    } catch (error) {
      await migrationPool.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      await migrationPool.end();
    }
  });

  const admin = await sessionFor({
    userId: SYNTHETIC_DATA.userAdmin.id,
    subject: SYNTHETIC_DATA.identityAdmin.providerSubject,
    audience: "nexi_admin",
    assuranceLevel: "aal2",
    tenantId: null,
  });
  const actor = { sessionId: admin.sessionId, userId: admin.userId };

  await t.test("only a live nexi_admin AAL2 session can read global data", async () => {
    const summary = await readDashboard(actor);
    assert.ok(summary.tenantTotal >= 3);
    const client = await sessionFor({
      userId: SYNTHETIC_DATA.userA.id,
      subject: SYNTHETIC_DATA.identityA.providerSubject,
      audience: "client_admin",
      assuranceLevel: "aal1",
      tenantId: SYNTHETIC_DATA.tenantA.id,
    });
    await assert.rejects(
      () => readDashboard({ sessionId: client.sessionId, userId: client.userId }),
      (error: unknown) => (error as { code?: string }).code === "42501",
    );
    await assert.rejects(
      () => readDashboard({ sessionId: randomUUID(), userId: admin.userId }),
      (error: unknown) => (error as { code?: string }).code === "42501",
    );
    await revokeAuthSession(tokenHash(admin.token), "test_revoked");
    await assert.rejects(
      () => readDashboard(actor),
      (error: unknown) => (error as { code?: string }).code === "42501",
    );
  });

  const activeAdmin = await sessionFor({
    userId: SYNTHETIC_DATA.userAdmin.id,
    subject: SYNTHETIC_DATA.identityAdmin.providerSubject,
    audience: "nexi_admin",
    assuranceLevel: "aal2",
    tenantId: null,
  });
  const activeActor = {
    sessionId: activeAdmin.sessionId,
    userId: activeAdmin.userId,
  };

  await t.test("tenant creation is draft, normalized and idempotent", async () => {
    const key = randomUUID();
    const createForm = form({
      display_name: "Empresa Etapa Seis",
      slug: "Empresa Etapa Seis",
      timezone: "America/Santiago",
      locale: "es-CL",
      idempotency_key: key,
    });
    tenantId = await createTenantFromForm(
      {
        ...activeAdmin,
        identityProvider: "test",
        identitySubject: SYNTHETIC_DATA.identityAdmin.providerSubject,
        email: SYNTHETIC_DATA.userAdmin.email,
        displayName: SYNTHETIC_DATA.userAdmin.displayName,
        audience: "nexi_admin",
        assuranceLevel: "aal2",
        activeTenantId: null,
        activeTenantName: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
      createForm,
      "admin-create-tenant-test",
    );
    const repeated = await createTenant(activeActor, {
      idempotencyKey: key,
      fingerprint: requestFingerprint([
        "Empresa Etapa Seis",
        "empresa-etapa-seis",
        "America/Santiago",
        "es-CL",
      ]),
      displayName: "Empresa Etapa Seis",
      slug: "empresa-etapa-seis",
      timezone: "America/Santiago",
      locale: "es-CL",
      correlationId: "admin-create-repeated-test",
    });
    assert.equal(repeated, tenantId);
    const tenant = await getTenant(activeActor, tenantId);
    assert.equal(tenant?.tenantStatus, "draft");
    assert.equal(tenant?.tenantSlug, "empresa-etapa-seis");

    await assert.rejects(
      () =>
        createTenant(activeActor, {
          idempotencyKey: randomUUID(),
          fingerprint: "a".repeat(64),
          displayName: "Reservado",
          slug: "admin",
          timezone: "America/Santiago",
          locale: "es-CL",
          correlationId: "reserved-slug-test",
        }),
      (error: unknown) => (error as { code?: string }).code === "22023",
    );
    await assert.rejects(
      () =>
        createTenant(activeActor, {
          idempotencyKey: randomUUID(),
          fingerprint: "b".repeat(64),
          displayName: "Duplicado",
          slug: "empresa-etapa-seis",
          timezone: "America/Santiago",
          locale: "es-CL",
          correlationId: "duplicate-slug-test",
        }),
      (error: unknown) => (error as { code?: string }).code === "23505",
    );
  });

  await t.test("search, filters, edit and optimistic concurrency are server-side", async () => {
    const listed = await listTenants(activeActor, {
      search: "etapa seis",
      status: "draft",
      sort: "name_asc",
      limit: 5,
      offset: 0,
    });
    assert.ok(listed.some((tenant) => tenant.tenantId === tenantId));
    const before = await getTenant(activeActor, tenantId);
    assert.ok(before);
    await updateTenant(activeActor, {
      tenantId,
      expectedUpdatedAt: before!.tenantUpdatedAt,
      displayName: "Empresa Etapa Seis Actualizada",
      slug: "empresa-etapa-seis",
      timezone: "America/Santiago",
      locale: "es-CL",
      correlationId: "tenant-update-test",
    });
    await assert.rejects(
      () =>
        updateTenant(activeActor, {
          tenantId,
          expectedUpdatedAt: before!.tenantUpdatedAt,
          displayName: "Cambio obsoleto",
          slug: "empresa-etapa-seis",
          timezone: "America/Santiago",
          locale: "es-CL",
          correlationId: "tenant-conflict-test",
        }),
      (error: unknown) => (error as { code?: string }).code === "40001",
    );
  });

  let invitationToken = "";
  await t.test("invitation is provider-backed, expiring and contains no clear token", async () => {
    const result = await createInvitationFromForm(
      {
        ...activeAdmin,
        identityProvider: "test",
        identitySubject: SYNTHETIC_DATA.identityAdmin.providerSubject,
        email: SYNTHETIC_DATA.userAdmin.email,
        displayName: SYNTHETIC_DATA.userAdmin.displayName,
        audience: "nexi_admin",
        assuranceLevel: "aal2",
        activeTenantId: null,
        activeTenantName: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
      form({
        tenant_id: tenantId,
        display_name: "Invitada Etapa 6",
        email: invitedEmail.toUpperCase(),
        idempotency_key: randomUUID(),
      }),
      "invitation-create-test",
    );
    assert.ok(result.acceptanceToken);
    invitationToken = result.acceptanceToken!;
    const invitations = await listInvitations(activeActor, {
      tenantId,
      status: "pending",
      limit: 10,
      offset: 0,
    });
    assert.equal(invitations.length, 1);
    assert.equal(invitations[0].invitationEmail, invitedEmail);
    assert.ok(invitations[0].invitationExpiresAt > new Date());

    const stored = await migrationPool.query<{ providerReference: string }>(
      `SELECT provider_reference AS "providerReference"
       FROM public.tenant_invitations WHERE id = $1`,
      [invitations[0].invitationId],
    );
    assert.notEqual(stored.rows[0].providerReference, invitationToken);
    assert.equal(stored.rows[0].providerReference.length, 64);

    const renewed = await resendInvitationFromForm(
      {
        ...activeAdmin,
        identityProvider: "test",
        identitySubject: SYNTHETIC_DATA.identityAdmin.providerSubject,
        email: SYNTHETIC_DATA.userAdmin.email,
        displayName: SYNTHETIC_DATA.userAdmin.displayName,
        audience: "nexi_admin",
        assuranceLevel: "aal2",
        activeTenantId: null,
        activeTenantName: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
      form({ invitation_id: invitations[0].invitationId }),
      "invitation-resend-test",
    );
    assert.ok(renewed.acceptanceToken);
    assert.notEqual(renewed.acceptanceToken, invitationToken);
    invitationToken = renewed.acceptanceToken!;
    const renewedRow = await listInvitations(activeActor, {
      tenantId,
      status: "pending",
      limit: 10,
      offset: 0,
    });
    assert.equal(renewedRow[0].invitationAttemptCount, 2);

    await assert.rejects(
      () =>
        reserveInvitation(activeActor, {
          tenantId,
          idempotencyKey: randomUUID(),
          fingerprint: "c".repeat(64),
          email: invitedEmail,
          displayName: "Duplicada",
          provider: "test",
          expiresAt: new Date(Date.now() + 60_000),
        }),
      (error: unknown) => (error as { code?: string }).code === "23505",
    );
  });

  let membershipId = "";
  let invitedUserId = "";
  await t.test("concurrent acceptance creates identity and membership exactly once", async () => {
    const [first, second] = await Promise.all([
      acceptInvitationToken(invitationToken, "invitation-accept-race-a"),
      acceptInvitationToken(invitationToken, "invitation-accept-race-b"),
    ]);
    assert.equal(second.membershipId, first.membershipId);
    membershipId = first.membershipId;
    invitedUserId = first.userId;
    const memberships = await listMemberships(activeActor, tenantId);
    assert.equal(
      memberships.filter((membership) => membership.userId === invitedUserId)
        .length,
      1,
    );
    const invitation = await listInvitations(activeActor, {
      tenantId,
      status: "accepted",
      limit: 10,
      offset: 0,
    });
    assert.equal(invitation.length, 1);
  });

  await t.test("an existing user gains a second tenant without duplicate identity", async () => {
    const beforeUsers = await migrationPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.users",
    );
    const existingInvitation = await createInvitationFromForm(
      {
        ...activeAdmin,
        identityProvider: "test",
        identitySubject: SYNTHETIC_DATA.identityAdmin.providerSubject,
        email: SYNTHETIC_DATA.userAdmin.email,
        displayName: SYNTHETIC_DATA.userAdmin.displayName,
        audience: "nexi_admin",
        assuranceLevel: "aal2",
        activeTenantId: null,
        activeTenantName: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
      form({
        tenant_id: tenantId,
        display_name: SYNTHETIC_DATA.userA.displayName,
        email: SYNTHETIC_DATA.userA.email,
        idempotency_key: randomUUID(),
      }),
      "existing-user-invitation-test",
    );
    const accepted = await acceptInvitationToken(
      existingInvitation.acceptanceToken!,
      "existing-user-acceptance-test",
    );
    assert.equal(accepted.userId, SYNTHETIC_DATA.userA.id);
    const afterUsers = await migrationPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.users",
    );
    assert.equal(afterUsers.rows[0].count, beforeUsers.rows[0].count);
    const identities = await migrationPool.query(
      `SELECT 1 FROM public.auth_identities
       WHERE user_id=$1 AND provider='test'`,
      [SYNTHETIC_DATA.userA.id],
    );
    assert.equal(identities.rowCount, 1);
  });

  await t.test("activation, suspension and reactivation preserve data", async () => {
    await setTenantStatus(
      activeActor,
      tenantId,
      "active",
      "Activación técnica controlada",
      "tenant-activate-test",
    );
    const invitedSession = await sessionFor({
      userId: invitedUserId,
      subject: invitedSubject,
      audience: "client_admin",
      assuranceLevel: "aal1",
      tenantId,
    });
    await setTenantStatus(
      activeActor,
      tenantId,
      "suspended",
      "Suspensión de prueba controlada",
      "tenant-suspend-test",
    );
    assert.equal(await readAuthSession(tokenHash(invitedSession.token)), null);
    assert.equal(
      (await listMemberships(activeActor, tenantId)).find(
        (membership) => membership.userId === invitedUserId,
      )?.membershipStatus,
      "active",
    );
    await setTenantStatus(
      activeActor,
      tenantId,
      "active",
      "Reactivación de prueba controlada",
      "tenant-reactivate-test",
    );
    const restored = await sessionFor({
      userId: invitedUserId,
      subject: invitedSubject,
      audience: "client_admin",
      assuranceLevel: "aal1",
      tenantId,
    });
    assert.ok(await readAuthSession(tokenHash(restored.token)));
  });

  await t.test("membership changes affect only the selected tenant", async () => {
    const tokenA = randomBytes(32).toString("base64url");
    const tokenB = randomBytes(32).toString("base64url");
    await createAuthSession({
      tokenHash: tokenHash(tokenA),
      userId: SYNTHETIC_DATA.userMulti.id,
      identityProvider: "test",
      identitySubject: SYNTHETIC_DATA.identityMulti.providerSubject,
      audience: "client_admin",
      assuranceLevel: "aal1",
      activeTenantId: SYNTHETIC_DATA.tenantA.id,
      expiresAt: new Date(Date.now() + 60_000),
      userAgentHash: null,
      ipHash: null,
    });
    await createAuthSession({
      tokenHash: tokenHash(tokenB),
      userId: SYNTHETIC_DATA.userMulti.id,
      identityProvider: "test",
      identitySubject: SYNTHETIC_DATA.identityMulti.providerSubject,
      audience: "client_admin",
      assuranceLevel: "aal1",
      activeTenantId: SYNTHETIC_DATA.tenantB.id,
      expiresAt: new Date(Date.now() + 60_000),
      userAgentHash: null,
      ipHash: null,
    });
    await setMembershipStatus(
      activeActor,
      SYNTHETIC_DATA.membershipMultiA.id,
      "disabled",
      "Prueba de aislamiento por empresa",
      "membership-disable-test",
    );
    assert.equal(await readAuthSession(tokenHash(tokenA)), null);
    assert.ok(await readAuthSession(tokenHash(tokenB)));
    await setMembershipStatus(
      activeActor,
      SYNTHETIC_DATA.membershipMultiA.id,
      "active",
      "Restauración de acceso de prueba",
      "membership-reactivate-test",
    );
    const invitedMembership = await setMembershipStatus(
      activeActor,
      membershipId,
      "disabled",
      "Desactivación de acceso invitado",
      "invited-membership-disable-test",
    );
    assert.equal(invitedMembership, true);
    const userStillExists = await migrationPool.query(
      "SELECT 1 FROM public.users WHERE id = $1",
      [invitedUserId],
    );
    assert.equal(userStillExists.rowCount, 1);
  });

  await t.test("audit is queryable by admin and append-only for nexi_app", async () => {
    const events = await listAudit(activeActor, {
      action: null,
      tenantId,
      actorSearch: null,
      from: null,
      to: null,
      outcome: null,
      limit: 50,
      offset: 0,
    });
    const actions = new Set(events.map((event) => event.action));
    for (const action of [
      "tenant_created",
      "tenant_updated",
      "tenant_activated",
      "tenant_suspended",
      "tenant_reactivated",
      "invitation_created",
      "invitation_accepted",
      "membership_created",
      "membership_disabled",
    ]) {
      assert.ok(actions.has(action), `missing ${action}`);
    }
    const filtered = await listAudit(activeActor, {
      action: "tenant_created",
      tenantId,
      actorSearch: SYNTHETIC_DATA.userAdmin.email,
      from: testStartedAt,
      to: new Date(Date.now() + 60_000),
      outcome: "succeeded",
      limit: 50,
      offset: 0,
    });
    assert.ok(filtered.length >= 1);
    assert.ok(
      filtered.every(
        (event) =>
          event.action === "tenant_created" &&
          event.tenantId === tenantId &&
          event.outcome === "succeeded",
      ),
    );
    const appPool = createDatabasePool({
      connectionString: readDatabaseUrl("application"),
      applicationName: "nexi-admin-direct-denial-test",
      maxConnections: 1,
    });
    await assert.rejects(
      () => appPool.query("UPDATE public.platform_audit_events SET reason = 'x'"),
      (error: unknown) => (error as { code?: string }).code === "42501",
    );
    await assert.rejects(
      () => appPool.query("SELECT * FROM public.tenant_invitations"),
      (error: unknown) => (error as { code?: string }).code === "42501",
    );
    await appPool.end();
  });

  await t.test("revoked and expired invitations cannot be accepted", async () => {
    const provider = new TestIdentityProvider();
    const reservation = await reserveInvitation(activeActor, {
      tenantId,
      idempotencyKey: randomUUID(),
      fingerprint: "d".repeat(64),
      email: "revocada@example.invalid",
      displayName: "Invitación Revocada",
      provider: "test",
      expiresAt: new Date(Date.now() + 60_000),
    });
    assert.equal(reservation.shouldDispatch, true);
    const dispatch = await provider.sendInvitation(
      "revocada@example.invalid",
      "Invitación Revocada",
      "http://localhost:3000/invitacion/aceptar",
    );
    await completeInvitation(
      activeActor,
      reservation.invitationId,
      dispatch.providerReference,
      new Date(Date.now() + 60_000),
      "invitation-complete-revoke-test",
    );
    await revokeInvitation(
      activeActor,
      reservation.invitationId,
      "Revocación de prueba controlada",
      "invitation-revoke-test",
    );
    const revoked = await migrationPool.query<{ status: string }>(
      "SELECT status FROM public.tenant_invitations WHERE id=$1",
      [reservation.invitationId],
    );
    assert.equal(revoked.rows[0].status, "revoked");
    await assert.rejects(() =>
      acceptInvitationToken(
        dispatch.acceptanceToken!,
        "revoked-acceptance-test",
      ),
    );

    const expiryReservation = await reserveInvitation(activeActor, {
      tenantId,
      idempotencyKey: randomUUID(),
      fingerprint: "f".repeat(64),
      email: "expirada@example.invalid",
      displayName: "Invitación Expirada",
      provider: "test",
      expiresAt: new Date(Date.now() + 250),
    });
    const expiryDispatch = await provider.sendInvitation(
      "expirada@example.invalid",
      "Invitación Expirada",
      "http://localhost:3000/invitacion/aceptar",
    );
    await completeInvitation(
      activeActor,
      expiryReservation.invitationId,
      expiryDispatch.providerReference,
      new Date(Date.now() + 250),
      "invitation-complete-expiry-test",
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    const expired = await migrationPool.query(
      `UPDATE public.tenant_invitations
       SET status = 'expired'
       WHERE status = 'pending'
         AND expires_at <= transaction_timestamp()`,
    );
    assert.equal(expired.rowCount, 1);
    await assert.rejects(() =>
      acceptInvitationToken(
        expiryDispatch.acceptanceToken!,
        "expired-acceptance-test",
      ),
    );
  });
});
