import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { createAuthSession, revokeAuthSession } from "../../src/auth/auth-repository.server";
import { loadAuthConfig } from "../../src/auth/config";
import { createSessionToken, hashSessionToken } from "../../src/auth/security";
import type { AuthSession } from "../../src/auth/types";
import {
  listClientCompanies,
  loadDashboard,
  loadPlan,
  loadProfiles,
  loadSites,
} from "../../src/client-portal/client-service.server";
import { handleClientAction } from "../../src/client-portal/http.server";
import { readDatabaseUrl } from "../../src/db/config";
import { createDatabasePool } from "../../src/db/pool";
import {
  applyMigrations,
  rollbackAllMigrations,
} from "../../scripts/db/migrations";
import { seedSyntheticData, SYNTHETIC_DATA } from "../../scripts/db/seed";

const migrationUrl = readDatabaseUrl("migration");
const appUrl = "http://localhost:3000";
const config = loadAuthConfig();
const migrationPool = createDatabasePool({
  connectionString: migrationUrl,
  applicationName: "nexi-client-portal-tests",
  maxConnections: 1,
});

interface SessionFixture {
  token: string;
  session: AuthSession;
}

async function createClientFixture(input: {
  userId: string;
  subject: string;
  email: string;
  displayName: string;
  tenantId: string | null;
  tenantName: string | null;
}): Promise<SessionFixture> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const sessionId = await createAuthSession({
    tokenHash: hashSessionToken(token),
    userId: input.userId,
    identityProvider: "test",
    identitySubject: input.subject,
    audience: "client_admin",
    assuranceLevel: "aal1",
    activeTenantId: input.tenantId,
    expiresAt,
    userAgentHash: null,
    ipHash: null,
  });
  return {
    token,
    session: {
      sessionId,
      userId: input.userId,
      identityProvider: "test",
      identitySubject: input.subject,
      email: input.email,
      displayName: input.displayName,
      audience: "client_admin",
      assuranceLevel: "aal1",
      activeTenantId: input.tenantId,
      activeTenantName: input.tenantName,
      expiresAt,
    },
  };
}

function clientRequest(
  token: string,
  fields: Record<string, string>,
  origin = appUrl,
): Request {
  const body = new URLSearchParams(fields);
  return new Request(`${appUrl}/api/client/actions`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      cookie: `${config.cookieName}=${token}`,
      origin,
    },
    body,
  });
}

let clientA: SessionFixture;
let clientMultiA: SessionFixture;
let clientMultiB: SessionFixture;
let suspendedClient: SessionFixture;
let disabledMembershipClient: SessionFixture;

before(async () => {
  await rollbackAllMigrations(migrationUrl);
  await applyMigrations(migrationUrl);
  await seedSyntheticData(migrationUrl);
  clientA = await createClientFixture({
    userId: SYNTHETIC_DATA.userA.id,
    subject: SYNTHETIC_DATA.identityA.providerSubject,
    email: SYNTHETIC_DATA.userA.email,
    displayName: SYNTHETIC_DATA.userA.displayName,
    tenantId: SYNTHETIC_DATA.tenantA.id,
    tenantName: SYNTHETIC_DATA.tenantA.displayName,
  });
  clientMultiA = await createClientFixture({
    userId: SYNTHETIC_DATA.userMulti.id,
    subject: SYNTHETIC_DATA.identityMulti.providerSubject,
    email: SYNTHETIC_DATA.userMulti.email,
    displayName: SYNTHETIC_DATA.userMulti.displayName,
    tenantId: SYNTHETIC_DATA.tenantA.id,
    tenantName: SYNTHETIC_DATA.tenantA.displayName,
  });
  clientMultiB = await createClientFixture({
    userId: SYNTHETIC_DATA.userMulti.id,
    subject: SYNTHETIC_DATA.identityMulti.providerSubject,
    email: SYNTHETIC_DATA.userMulti.email,
    displayName: SYNTHETIC_DATA.userMulti.displayName,
    tenantId: SYNTHETIC_DATA.tenantB.id,
    tenantName: SYNTHETIC_DATA.tenantB.displayName,
  });
  suspendedClient = await createClientFixture({
    userId: SYNTHETIC_DATA.userSuspended.id,
    subject: SYNTHETIC_DATA.identitySuspended.providerSubject,
    email: SYNTHETIC_DATA.userSuspended.email,
    displayName: SYNTHETIC_DATA.userSuspended.displayName,
    tenantId: null,
    tenantName: null,
  });
  disabledMembershipClient = await createClientFixture({
    userId: SYNTHETIC_DATA.userDisabledMembership.id,
    subject: SYNTHETIC_DATA.identityDisabledMembership.providerSubject,
    email: SYNTHETIC_DATA.userDisabledMembership.email,
    displayName: SYNTHETIC_DATA.userDisabledMembership.displayName,
    tenantId: null,
    tenantName: null,
  });
});

after(async () => {
  await migrationPool.end();
});

test("client dashboard, sites and plan use only the active company", async () => {
  const dashboard = await loadDashboard(clientA.session);
  assert.equal(dashboard.tenantName, SYNTHETIC_DATA.tenantA.displayName);
  assert.equal(dashboard.siteCount, 2);
  assert.equal(dashboard.planName, "Esencial");

  const sites = await loadSites(clientA.session);
  assert.deepEqual(
    new Set(sites.map((site) => site.id)),
    new Set([SYNTHETIC_DATA.siteA.id, SYNTHETIC_DATA.siteA2.id]),
  );
  const plan = await loadPlan(clientA.session);
  assert.equal(plan?.code, "essential");
  assert.ok(plan?.features.some((feature) => feature.key === "nexi_support"));
});

test("multi-company sessions never mix sites, plans or profiles", async () => {
  const companies = await listClientCompanies(clientMultiA.session);
  assert.deepEqual(
    companies.filter((company) => company.isAvailable).map((company) => company.tenantId),
    [SYNTHETIC_DATA.tenantA.id, SYNTHETIC_DATA.tenantB.id],
  );
  assert.deepEqual(
    new Set((await loadSites(clientMultiA.session)).map((site) => site.id)),
    new Set([SYNTHETIC_DATA.siteA.id, SYNTHETIC_DATA.siteA2.id]),
  );
  assert.deepEqual(
    new Set((await loadSites(clientMultiB.session)).map((site) => site.id)),
    new Set([SYNTHETIC_DATA.siteB.id, SYNTHETIC_DATA.siteB2.id]),
  );
  assert.equal((await loadPlan(clientMultiA.session))?.code, "essential");
  assert.equal((await loadPlan(clientMultiB.session))?.code, "pro");
});

test("known tenant identifiers and platform role do not grant client access", async () => {
  await assert.rejects(
    loadDashboard({
      ...clientA.session,
      activeTenantId: SYNTHETIC_DATA.tenantB.id,
      activeTenantName: SYNTHETIC_DATA.tenantB.displayName,
    }),
  );
  await assert.rejects(
    loadDashboard({
      ...clientA.session,
      audience: "nexi_admin",
      assuranceLevel: "aal2",
      activeTenantId: null,
      activeTenantName: null,
    }),
  );
});

test("suspended companies and disabled memberships remain visible but unavailable", async () => {
  const suspended = await listClientCompanies(suspendedClient.session);
  assert.equal(suspended.length, 1);
  assert.equal(suspended[0].tenantStatus, "suspended");
  assert.equal(suspended[0].isAvailable, false);

  const disabled = await listClientCompanies(disabledMembershipClient.session);
  assert.equal(disabled.length, 1);
  assert.equal(disabled[0].membershipStatus, "disabled");
  assert.equal(disabled[0].isAvailable, false);
});

test("authorized profile updates persist, audit and reject stale writes", async () => {
  const before = await loadProfiles(clientA.session);
  const response = await handleClientAction(
    clientRequest(clientA.token, {
      action: "personal_profile_update",
      display_name: "Ana Cuenta Ficticia",
      phone: "+56933333333",
      locale: "es-CL",
      profile_version: String(before.personal.version),
    }),
  );
  assert.equal(response.status, 200);
  const saved = (await response.json()) as { version: number };
  assert.equal(saved.version, before.personal.version + 1);

  const afterUpdate = await loadProfiles(clientA.session);
  assert.equal(afterUpdate.personal.displayName, "Ana Cuenta Ficticia");
  assert.equal(afterUpdate.personal.phone, "+56933333333");
  assert.equal(afterUpdate.personal.email, SYNTHETIC_DATA.userA.email);

  const conflict = await handleClientAction(
    clientRequest(clientA.token, {
      action: "personal_profile_update",
      display_name: "Valor desactualizado",
      phone: "+56944444444",
      locale: "es-CL",
      profile_version: String(before.personal.version),
    }),
  );
  assert.equal(conflict.status, 409);

  const audit = await migrationPool.query<{ action: string }>(
    `SELECT action
     FROM public.platform_audit_events
     WHERE actor_user_id = $1
       AND action = 'personal_profile_updated'`,
    [SYNTHETIC_DATA.userA.id],
  );
  assert.equal(audit.rowCount, 1);
});

test("concurrent profile updates never overwrite silently", async () => {
  const profile = await loadProfiles(clientMultiA.session);
  const request = (displayName: string) =>
    handleClientAction(
      clientRequest(clientMultiA.token, {
        action: "personal_profile_update",
        display_name: displayName,
        phone: "",
        locale: "es-CL",
        profile_version: String(profile.personal.version),
      }),
    );
  const responses = await Promise.all([
    request("Cuenta Concurrente A"),
    request("Cuenta Concurrente B"),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
});

test("company profile updates stay inside the active company", async () => {
  const before = await loadProfiles(clientMultiB.session);
  const response = await handleClientAction(
    clientRequest(clientMultiB.token, {
      action: "company_profile_update",
      display_name: "Taller Laguna Actualizado",
      legal_name: "Taller Laguna Ficticio SpA",
      contact_email: "contacto.laguna@example.invalid",
      contact_phone: "+56966666666",
      description: "Descripción ficticia actualizada.",
      timezone: "America/Santiago",
      locale: "es-CL",
      profile_version: String(before.company.version),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(
    (await loadProfiles(clientMultiB.session)).company.displayName,
    "Taller Laguna Actualizado",
  );
  assert.equal(
    (await loadProfiles(clientMultiA.session)).company.displayName,
    SYNTHETIC_DATA.tenantA.displayName,
  );
});

test("forbidden fields, invalid origins and revoked sessions fail closed", async () => {
  const profile = await loadProfiles(clientA.session);
  const forbidden = await handleClientAction(
    clientRequest(clientA.token, {
      action: "personal_profile_update",
      display_name: profile.personal.displayName,
      phone: profile.personal.phone,
      locale: profile.personal.locale,
      profile_version: String(profile.personal.version),
      role: "nexi_admin",
    }),
  );
  assert.equal(forbidden.status, 403);

  const invalidOrigin = await handleClientAction(
    clientRequest(
      clientA.token,
      {
        action: "personal_profile_update",
        display_name: profile.personal.displayName,
        phone: profile.personal.phone,
        locale: profile.personal.locale,
        profile_version: String(profile.personal.version),
      },
      "https://attacker.invalid",
    ),
  );
  assert.equal(invalidOrigin.status, 403);

  const revoked = await createClientFixture({
    userId: SYNTHETIC_DATA.userB.id,
    subject: SYNTHETIC_DATA.identityB.providerSubject,
    email: SYNTHETIC_DATA.userB.email,
    displayName: SYNTHETIC_DATA.userB.displayName,
    tenantId: SYNTHETIC_DATA.tenantB.id,
    tenantName: SYNTHETIC_DATA.tenantB.displayName,
  });
  await revokeAuthSession(hashSessionToken(revoked.token), "test_revoked");
  const rejected = await handleClientAction(
    clientRequest(revoked.token, {
      action: "personal_profile_update",
      display_name: SYNTHETIC_DATA.userB.displayName,
      phone: "",
      locale: "es-CL",
      profile_version: "1",
    }),
  );
  assert.equal(rejected.status, 401);
});

test("client mutation rate limiting blocks repeated direct requests", async () => {
  await migrationPool.query(
    "DELETE FROM public.auth_rate_limits WHERE scope = 'client_mutation'",
  );
  let response: Response | undefined;
  for (let attempt = 0; attempt < 41; attempt += 1) {
    response = await handleClientAction(
      clientRequest(clientMultiA.token, {
        action: "forbidden_action",
      }),
    );
  }
  assert.equal(response?.status, 429);
  assert.ok(Number(response?.headers.get("retry-after")) > 0);
});
