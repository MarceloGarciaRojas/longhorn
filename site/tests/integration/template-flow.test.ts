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
  publishContent,
  publishContentTransaction,
  resolvePublicSite,
  restorePublication,
} from "../../src/content/service.server";
import {
  rendererOnboardingIsAllowed,
  rendererPublicationIsAllowed,
  templateSelectionIsAllowed,
} from "../../src/content/template-capabilities";
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

async function refreshClientFixture(): Promise<void> {
  clientB.sessionId = await createAuthSession({
    tokenHash: hashSessionToken(createSessionToken()),
    userId: SYNTHETIC_DATA.userB.id,
    identityProvider: "test",
    identitySubject: SYNTHETIC_DATA.identityB.providerSubject,
    audience: "client_admin",
    assuranceLevel: "aal1",
    activeTenantId: SYNTHETIC_DATA.tenantB.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    userAgentHash: null,
    ipHash: null,
  });
}

function operationForm(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function changeForm(
  siteId: string,
  templateId: string,
  version: number,
  idempotencyKey = randomUUID(),
): FormData {
  return operationForm({
    site_id: siteId,
    template_version_id: templateId,
    assignment_version: String(version),
    idempotency_key: idempotencyKey,
  });
}

function publicationForm(
  siteId: string,
  revision: number,
  idempotencyKey = randomUUID(),
): FormData {
  return operationForm({
    site_id: siteId,
    revision: String(revision),
    idempotency_key: idempotencyKey,
  });
}

test("Editorial is selectable, publishable and historically restorable through shared flows", async () => {
  await refreshClientFixture();
  const pool = createDatabasePool({
    connectionString: readDatabaseUrl("migration"),
    applicationName: "nexi-template-editorial-flow",
    maxConnections: 3,
  });
  try {
    const before = await resolvePublicSite({ siteSlug: SYNTHETIC_DATA.siteB.slug });
    assert.equal(before?.rendererKey, "restaurant-classic-v1");
    const initialState = await pool.query<{
      assignmentVersion: number;
      publicationCount: number;
      publicationId: string;
    }>(
      `SELECT assignment.version AS "assignmentVersion",
         site.current_publication_id AS "publicationId",
         (SELECT count(*)::int FROM public.site_content_publications publication
          WHERE publication.site_id=site.id) AS "publicationCount"
       FROM public.sites site
       JOIN public.site_template_assignments assignment ON assignment.site_id=site.id
       WHERE site.id=$1`,
      [SYNTHETIC_DATA.siteB.id],
    );
    const catalog = await clientCompatibleTemplates(clientB, SYNTHETIC_DATA.siteB.id);
    assert.ok(catalog);
    assert.deepEqual(
      catalog.options.map((option) => option.templateKey),
      ["restaurant-classic", "restaurant-modern", "restaurant-editorial"],
    );
    const classic = catalog.options.find(
      (option) => option.rendererKey === "restaurant-classic-v2",
    );
    const modern = catalog.options.find(
      (option) => option.rendererKey === "restaurant-modern-v1",
    );
    const editorial = catalog.options.find(
      (option) => option.rendererKey === "restaurant-editorial-v1",
    );
    assert.ok(classic);
    assert.ok(modern);
    assert.ok(editorial);
    assert.equal(templateSelectionIsAllowed(editorial), true);
    assert.equal(rendererPublicationIsAllowed(editorial.rendererKey, "restaurant"), true);
    assert.equal(rendererOnboardingIsAllowed(editorial.rendererKey, "restaurant"), true);

    const clientPreview = await clientPreviewAlternativeTemplate(
      clientB,
      SYNTHETIC_DATA.siteB.id,
      editorial.id,
    );
    assert.equal(clientPreview?.option.id, editorial.id);
    assert.equal(clientPreview?.draft.schemaKey, "restaurant.v2");
    const nexiAdmin = await createAdminFixture();
    const adminPreview = await adminPreviewAlternativeTemplate(
      nexiAdmin,
      SYNTHETIC_DATA.siteB.id,
      editorial.id,
    );
    assert.equal(adminPreview?.option.id, editorial.id);
    await assert.rejects(
      adminPreviewAlternativeTemplate(
        { ...nexiAdmin, assuranceLevel: "aal1" },
        SYNTHETIC_DATA.siteB.id,
        editorial.id,
      ),
      (error: unknown) => (error as { code?: string }).code === "42501",
    );

    const adminKey = randomUUID();
    const adminSelection = changeForm(
      SYNTHETIC_DATA.siteB.id,
      editorial.id,
      initialState.rows[0].assignmentVersion,
      adminKey,
    );
    assert.equal(
      await adminAssignTemplate(nexiAdmin, adminSelection, "editorial-admin-select"),
      SYNTHETIC_DATA.siteB.id,
    );
    assert.equal(
      await adminAssignTemplate(nexiAdmin, adminSelection, "editorial-admin-replay"),
      SYNTHETIC_DATA.siteB.id,
    );
    await assert.rejects(
      adminAssignTemplate(
        { ...nexiAdmin, assuranceLevel: "aal1" },
        changeForm(
          SYNTHETIC_DATA.siteB.id,
          modern.id,
          initialState.rows[0].assignmentVersion + 1,
        ),
        "editorial-admin-aal1-denied",
      ),
      (error: unknown) =>
        error instanceof OperationValidationError && error.code === "denied",
    );

    let workspace = await clientContentWorkspace(clientB, SYNTHETIC_DATA.siteB.id);
    assert.equal(workspace?.assignment?.rendererKey, "restaurant-editorial-v1");
    assert.equal(
      workspace?.assignment?.version,
      initialState.rows[0].assignmentVersion + 1,
    );
    assert.equal(
      (await resolvePublicSite({ siteSlug: SYNTHETIC_DATA.siteB.slug }))?.publicationId,
      initialState.rows[0].publicationId,
    );

    const raceVersion = workspace!.assignment!.version;
    const raced = await Promise.allSettled([
      clientChangeTemplate(
        clientB,
        changeForm(SYNTHETIC_DATA.siteB.id, modern.id, raceVersion),
        "editorial-race-modern",
      ),
      clientChangeTemplate(
        clientB,
        changeForm(SYNTHETIC_DATA.siteB.id, classic.id, raceVersion),
        "editorial-race-classic",
      ),
    ]);
    assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(raced.filter((result) => result.status === "rejected").length, 1);
    assert.ok(
      raced.some(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof OperationValidationError &&
          result.reason.code === "conflict",
      ),
    );
    workspace = await clientContentWorkspace(clientB, SYNTHETIC_DATA.siteB.id);
    assert.equal(workspace?.assignment?.version, raceVersion + 1);

    const clientKey = randomUUID();
    const clientSelection = changeForm(
      SYNTHETIC_DATA.siteB.id,
      editorial.id,
      workspace!.assignment!.version,
      clientKey,
    );
    await clientChangeTemplate(clientB, clientSelection, "editorial-client-select");
    await clientChangeTemplate(clientB, clientSelection, "editorial-client-replay");
    workspace = await clientContentWorkspace(clientB, SYNTHETIC_DATA.siteB.id);
    assert.equal(workspace?.assignment?.rendererKey, "restaurant-editorial-v1");
    assert.equal(
      (await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM public.site_content_publications
         WHERE site_id=$1`,
        [SYNTHETIC_DATA.siteB.id],
      )).rows[0].count,
      initialState.rows[0].publicationCount,
    );
    assert.equal(
      (await resolvePublicSite({ siteSlug: SYNTHETIC_DATA.siteB.slug }))?.publicationId,
      initialState.rows[0].publicationId,
    );

    const publicationKey = randomUUID();
    const firstPublisher = await pool.connect();
    const secondPublisher = await pool.connect();
    try {
      await firstPublisher.query("BEGIN");
      const firstResult = await publishContentTransaction(firstPublisher, {
        tenantId: SYNTHETIC_DATA.tenantB.id,
        actorUserId: SYNTHETIC_DATA.userB.id,
        siteId: SYNTHETIC_DATA.siteB.id,
        expectedRevision: workspace!.draft!.revision,
        idempotencyKey: publicationKey,
      });
      await secondPublisher.query("BEGIN");
      const secondPending = publishContentTransaction(secondPublisher, {
        tenantId: SYNTHETIC_DATA.tenantB.id,
        actorUserId: SYNTHETIC_DATA.userB.id,
        siteId: SYNTHETIC_DATA.siteB.id,
        expectedRevision: workspace!.draft!.revision,
        idempotencyKey: publicationKey,
      });
      await firstPublisher.query("COMMIT");
      const secondResult = await secondPending;
      await secondPublisher.query("COMMIT");
      assert.equal(firstResult.replayed, undefined);
      assert.equal(secondResult.replayed, true);
      assert.equal(firstResult.publicationId, secondResult.publicationId);
    } catch (error) {
      await Promise.allSettled([
        firstPublisher.query("ROLLBACK"),
        secondPublisher.query("ROLLBACK"),
      ]);
      throw error;
    } finally {
      firstPublisher.release();
      secondPublisher.release();
    }
    await publishContent(
      clientB,
      publicationForm(SYNTHETIC_DATA.siteB.id, workspace!.draft!.revision, publicationKey),
      "editorial-publish-retry",
    );
    const editorialPublic = await resolvePublicSite({ siteSlug: SYNTHETIC_DATA.siteB.slug });
    assert.equal(editorialPublic?.rendererKey, "restaurant-editorial-v1");
    assert.ok(editorialPublic?.publicationId);
    assert.equal(
      (await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM public.site_content_publications
         WHERE site_id=$1`,
        [SYNTHETIC_DATA.siteB.id],
      )).rows[0].count,
      initialState.rows[0].publicationCount + 1,
    );
    await assert.rejects(
      publishContent(
        clientB,
        publicationForm(SYNTHETIC_DATA.siteB.id, workspace!.draft!.revision - 1),
        "editorial-publish-stale",
      ),
      (error: unknown) =>
        error instanceof OperationValidationError && error.code === "conflict",
    );

    workspace = await clientContentWorkspace(clientB, SYNTHETIC_DATA.siteB.id);
    await clientChangeTemplate(
      clientB,
      changeForm(
        SYNTHETIC_DATA.siteB.id,
        modern.id,
        workspace!.assignment!.version,
      ),
      "editorial-to-modern",
    );
    assert.equal(
      (await resolvePublicSite({ siteSlug: SYNTHETIC_DATA.siteB.slug }))?.publicationId,
      editorialPublic?.publicationId,
    );
    workspace = await clientContentWorkspace(clientB, SYNTHETIC_DATA.siteB.id);
    await publishContent(
      clientB,
      publicationForm(SYNTHETIC_DATA.siteB.id, workspace!.draft!.revision),
      "modern-after-editorial",
    );
    assert.equal(
      (await resolvePublicSite({ siteSlug: SYNTHETIC_DATA.siteB.slug }))?.rendererKey,
      "restaurant-modern-v1",
    );

    await restorePublication(
      clientB,
      operationForm({
        site_id: SYNTHETIC_DATA.siteB.id,
        publication_id: editorialPublic!.publicationId,
        idempotency_key: randomUUID(),
      }),
      "restore-editorial-history",
    );
    const restoredEditorial = await resolvePublicSite({ siteSlug: SYNTHETIC_DATA.siteB.slug });
    assert.equal(restoredEditorial?.rendererKey, "restaurant-editorial-v1");
    assert.ok(restoredEditorial?.publicationId);
    assert.equal(
      (await pool.query<{ restoredFrom: string }>(
        `SELECT restored_from_publication_id AS "restoredFrom"
         FROM public.site_content_publications WHERE id=$1`,
        [restoredEditorial.publicationId],
      )).rows[0].restoredFrom,
      editorialPublic.publicationId,
    );
    const mediaSnapshots = await pool.query<{
      publicationId: string;
      fieldPath: string;
      assetId: string;
      altText: string;
      decorative: boolean;
    }>(
      `SELECT publication_id AS "publicationId",field_path AS "fieldPath",
         asset_id AS "assetId",alt_text AS "altText",decorative
       FROM public.content_media_references
       WHERE publication_id=ANY($1::uuid[])
       ORDER BY publication_id,field_path`,
      [[editorialPublic.publicationId, restoredEditorial.publicationId]],
    );
    const snapshot = (publicationId: string) =>
      mediaSnapshots.rows
        .filter((row) => row.publicationId === publicationId)
        .map((row) => ({
          fieldPath: row.fieldPath,
          assetId: row.assetId,
          altText: row.altText,
          decorative: row.decorative,
        }));
    assert.deepEqual(
      snapshot(restoredEditorial.publicationId),
      snapshot(editorialPublic.publicationId),
    );

    await restorePublication(
      clientB,
      operationForm({
        site_id: SYNTHETIC_DATA.siteB.id,
        publication_id: initialState.rows[0].publicationId,
        idempotency_key: randomUUID(),
      }),
      "restore-classic-history",
    );
    const final = await resolvePublicSite({ siteSlug: SYNTHETIC_DATA.siteB.slug });
    assert.equal(final?.rendererKey, "restaurant-classic-v1");
    assert.ok(final?.publicationId);
    assert.equal(
      (await pool.query<{ restoredFrom: string }>(
        `SELECT restored_from_publication_id AS "restoredFrom"
         FROM public.site_content_publications WHERE id=$1`,
        [final.publicationId],
      )).rows[0].restoredFrom,
      initialState.rows[0].publicationId,
    );
  } finally {
    await pool.end();
  }
});

test("another tenant cannot list, preview or select templates for the site", async () => {
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
  await assert.rejects(
    clientChangeTemplate(
      foreign,
      changeForm(
        SYNTHETIC_DATA.siteB.id,
        SYNTHETIC_DATA.templateRestaurantEditorialV1.id,
        1,
      ),
      "editorial-cross-tenant-denied",
    ),
    (error: unknown) =>
      error instanceof OperationValidationError && error.code === "not_found",
  );
});

test("a Gym site has no selectable templates without a Gym renderer", async () => {
  const pool = createDatabasePool({
    connectionString: readDatabaseUrl("migration"),
    applicationName: "nexi-gym-empty-catalog",
    maxConnections: 1,
  });
  const gymSiteId = "76666666-6666-4666-8666-766666666667";
  try {
    await pool.query(
      `INSERT INTO public.sites(id,tenant_id,display_name,slug,industry_key)
       VALUES($1,$2,'Gym sin plantilla','gym-sin-plantilla','gym')`,
      [gymSiteId, SYNTHETIC_DATA.tenantB.id],
    );
    const catalog = await clientCompatibleTemplates(clientB, gymSiteId);
    assert.ok(catalog);
    assert.equal(catalog.currentTemplateVersionId, null);
    assert.deepEqual(catalog.options, []);
  } finally {
    await pool.query("DELETE FROM public.sites WHERE id=$1", [gymSiteId]);
    await pool.end();
  }
});
