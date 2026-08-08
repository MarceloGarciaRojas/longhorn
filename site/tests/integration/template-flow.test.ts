import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createAuthSession } from "../../src/auth/auth-repository.server";
import { createSessionToken, hashSessionToken } from "../../src/auth/security";
import type { AuthSession } from "../../src/auth/types";
import {
  adminAssignTemplate,
  adminPreviewAlternativeTemplate,
  clientChangeTemplate,
  clientCompatibleTemplates,
  clientContentWorkspace,
  clientPreviewAlternativeTemplate,
  publishContentTransaction,
  resolvePublicSite,
} from "../../src/content/service.server";
import { rendererPublicationIsAllowed } from "../../src/content/template-capabilities";
import { readDatabaseUrl } from "../../src/db/config";
import { createDatabasePool } from "../../src/db/pool";
import { OperationValidationError } from "../../src/operations/validation";
import { SYNTHETIC_DATA } from "../../scripts/db/seed";

const clientB: AuthSession = {
  sessionId: "99999999-9999-4999-8999-999999999999",
  userId: SYNTHETIC_DATA.userB.id,
  identityProvider: "test",
  identitySubject: "test-client-b",
  email: SYNTHETIC_DATA.userB.email,
  displayName: SYNTHETIC_DATA.userB.displayName,
  audience: "client_admin",
  assuranceLevel: "aal1",
  activeTenantId: SYNTHETIC_DATA.tenantB.id,
  activeTenantName: SYNTHETIC_DATA.tenantB.displayName,
  expiresAt: new Date(Date.now() + 60_000),
};

async function createAdminFixture(): Promise<AuthSession> {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const sessionId = await createAuthSession({
    tokenHash: hashSessionToken(createSessionToken()),
    userId: SYNTHETIC_DATA.userAdmin.id,
    identityProvider: "test",
    identitySubject: SYNTHETIC_DATA.identityAdmin.providerSubject,
    audience: "nexi_admin",
    assuranceLevel: "aal2",
    activeTenantId: null,
    expiresAt,
    userAgentHash: null,
    ipHash: null,
  });
  return {
    sessionId,
    userId: SYNTHETIC_DATA.userAdmin.id,
    identityProvider: "test",
    identitySubject: SYNTHETIC_DATA.identityAdmin.providerSubject,
    email: SYNTHETIC_DATA.userAdmin.email,
    displayName: SYNTHETIC_DATA.userAdmin.displayName,
    audience: "nexi_admin",
    assuranceLevel: "aal2",
    activeTenantId: null,
    activeTenantName: null,
    expiresAt,
  };
}

function changeForm(siteId: string, templateId: string, version: number): FormData {
  const form = new FormData();
  form.set("site_id", siteId);
  form.set("template_version_id", templateId);
  form.set("assignment_version", String(version));
  form.set("idempotency_key", randomUUID());
  return form;
}

test("alternative preview and selection preserve current public publication", async () => {
  const before = await resolvePublicSite({ siteSlug: SYNTHETIC_DATA.siteB.slug });
  assert.equal(before?.rendererKey, "restaurant-classic-v1");
  const catalog = await clientCompatibleTemplates(clientB, SYNTHETIC_DATA.siteB.id);
  assert.ok(catalog);
  assert.equal(catalog.options.length, 3);
  assert.deepEqual(
    catalog.options.map((option) => option.templateKey),
    ["restaurant-classic", "restaurant-modern", "restaurant-editorial"],
  );
  const modern = catalog.options.find((option) => option.rendererKey === "restaurant-modern-v1");
  const editorial = catalog.options.find(
    (option) => option.rendererKey === "restaurant-editorial-v1",
  );
  assert.ok(modern);
  assert.ok(editorial);
  const preview = await clientPreviewAlternativeTemplate(
    clientB,
    SYNTHETIC_DATA.siteB.id,
    modern.id,
  );
  assert.equal(preview?.option.id, modern.id);
  const editorialPreview = await clientPreviewAlternativeTemplate(
    clientB,
    SYNTHETIC_DATA.siteB.id,
    editorial.id,
  );
  assert.equal(editorialPreview?.option.id, editorial.id);
  assert.equal(editorialPreview?.draft.schemaKey, "restaurant.v2");
  const nexiAdmin = await createAdminFixture();
  const adminPreview = await adminPreviewAlternativeTemplate(
    nexiAdmin,
    SYNTHETIC_DATA.siteB.id,
    modern.id,
  );
  assert.equal(adminPreview?.option.id, modern.id);
  const editorialAdminPreview = await adminPreviewAlternativeTemplate(
    nexiAdmin,
    SYNTHETIC_DATA.siteB.id,
    editorial.id,
  );
  assert.equal(editorialAdminPreview?.option.id, editorial.id);
  await assert.rejects(
    adminPreviewAlternativeTemplate(
      { ...nexiAdmin, assuranceLevel: "aal1" },
      SYNTHETIC_DATA.siteB.id,
      editorial.id,
    ),
    (error: unknown) => (error as { code?: string }).code === "42501",
  );
  assert.equal(
    await adminPreviewAlternativeTemplate(
      nexiAdmin,
      SYNTHETIC_DATA.siteB.id,
      SYNTHETIC_DATA.templateRestaurantV1.id,
    ),
    null,
  );
  const afterPreview = await resolvePublicSite({ siteSlug: SYNTHETIC_DATA.siteB.slug });
  assert.equal(afterPreview?.publicationId, before?.publicationId);
  assert.equal(afterPreview?.rendererKey, "restaurant-classic-v1");

  const workspace = await clientContentWorkspace(clientB, SYNTHETIC_DATA.siteB.id);
  assert.ok(workspace?.assignment);
  const unchangedBefore = {
    templateVersionId: workspace.assignment.templateVersionId,
    assignmentVersion: workspace.assignment.version,
    publicationId: before?.publicationId,
  };
  await assert.rejects(
    clientChangeTemplate(
      clientB,
      changeForm(
        SYNTHETIC_DATA.siteB.id,
        editorial.id,
        workspace.assignment.version,
      ),
      "template-editorial-direct-client",
    ),
    (error: unknown) =>
      error instanceof OperationValidationError && error.code === "denied",
  );
  await assert.rejects(
    adminAssignTemplate(
      nexiAdmin,
      changeForm(
        SYNTHETIC_DATA.siteB.id,
        editorial.id,
        workspace.assignment.version,
      ),
      "template-editorial-direct-admin",
    ),
    (error: unknown) =>
      error instanceof OperationValidationError && error.code === "denied",
  );
  const unchangedAfter = await clientContentWorkspace(
    clientB,
    SYNTHETIC_DATA.siteB.id,
  );
  assert.deepEqual(
    {
      templateVersionId: unchangedAfter?.assignment?.templateVersionId,
      assignmentVersion: unchangedAfter?.assignment?.version,
      publicationId: (await resolvePublicSite({
        siteSlug: SYNTHETIC_DATA.siteB.slug,
      }))?.publicationId,
    },
    unchangedBefore,
  );
  await clientChangeTemplate(
    clientB,
    changeForm(SYNTHETIC_DATA.siteB.id, modern.id, workspace.assignment.version),
    "template-change-test",
  );
  const changed = await clientContentWorkspace(clientB, SYNTHETIC_DATA.siteB.id);
  assert.equal(changed?.assignment?.rendererKey, "restaurant-modern-v1");
  assert.deepEqual(changed?.draft?.content, workspace.draft?.content);
  const afterChange = await resolvePublicSite({ siteSlug: SYNTHETIC_DATA.siteB.slug });
  assert.equal(afterChange?.publicationId, before?.publicationId);
  assert.equal(afterChange?.rendererKey, "restaurant-classic-v1");

  const classic = catalog.options.find((option) => option.rendererKey === "restaurant-classic-v2");
  assert.ok(classic);
  await clientChangeTemplate(
    clientB,
    changeForm(SYNTHETIC_DATA.siteB.id, classic.id, changed!.assignment!.version),
    "template-change-revert-test",
  );

  assert.equal(rendererPublicationIsAllowed(editorial.rendererKey), false);
  const pool = createDatabasePool({
    connectionString: readDatabaseUrl("migration"),
    applicationName: "nexi-template-negative-publication",
    maxConnections: 1,
  });
  const database = await pool.connect();
  try {
    await database.query("BEGIN");
    await database.query(
      `UPDATE public.site_template_assignments
       SET template_version_id=$2,idempotency_key=$3,
         assigned_by_user_id=$4
       WHERE site_id=$1`,
      [
        SYNTHETIC_DATA.siteB.id,
        editorial.id,
        randomUUID(),
        SYNTHETIC_DATA.userB.id,
      ],
    );
    const draft = await database.query<{ revision: number }>(
      `SELECT revision FROM public.site_content_drafts WHERE site_id=$1`,
      [SYNTHETIC_DATA.siteB.id],
    );
    const publicationCount = await database.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM public.site_content_publications WHERE site_id=$1`,
      [SYNTHETIC_DATA.siteB.id],
    );
    const result = await publishContentTransaction(database, {
      tenantId: SYNTHETIC_DATA.tenantB.id,
      actorUserId: SYNTHETIC_DATA.userB.id,
      siteId: SYNTHETIC_DATA.siteB.id,
      expectedRevision: draft.rows[0].revision,
      idempotencyKey: randomUUID(),
    });
    assert.equal(result.rejected, "renderer");
    assert.equal(
      (await database.query<{ count: number }>(
        `SELECT count(*)::int AS count
         FROM public.site_content_publications WHERE site_id=$1`,
        [SYNTHETIC_DATA.siteB.id],
      )).rows[0].count,
      publicationCount.rows[0].count,
    );
    await database.query("ROLLBACK");
  } finally {
    database.release();
    await pool.end();
  }
});

test("another tenant cannot list or preview templates for the site", async () => {
  const foreign: AuthSession = {
    ...clientB,
    sessionId: randomUUID(),
    userId: SYNTHETIC_DATA.userA.id,
    email: SYNTHETIC_DATA.userA.email,
    activeTenantId: SYNTHETIC_DATA.tenantA.id,
  };
  assert.equal(
    await clientCompatibleTemplates(foreign, SYNTHETIC_DATA.siteB.id),
    null,
  );
  assert.equal(
    await clientPreviewAlternativeTemplate(
      foreign,
      SYNTHETIC_DATA.siteB.id,
      SYNTHETIC_DATA.templateRestaurantEditorialV1.id,
    ),
    null,
  );
});
