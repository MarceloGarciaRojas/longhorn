import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createAuthSession } from "../../src/auth/auth-repository.server";
import { createSessionToken, hashSessionToken } from "../../src/auth/security";
import type { AuthSession } from "../../src/auth/types";
import {
  adminAssignTemplate,
  adminInitializeContent,
  clientContentWorkspace,
  clientPreviewContent,
  publishContent,
  resolvePublicSite,
  restorePublication,
  saveContentDraft,
} from "../../src/content/service.server";
import type { RestaurantContent } from "../../src/content/types";
import { readDatabaseUrl } from "../../src/db/config";
import { createDatabasePool } from "../../src/db/pool";
import { withClientOperation } from "../../src/operations/contexts.server";
import { adminCreateSite } from "../../src/operations/service.server";
import { OperationValidationError } from "../../src/operations/validation";
import {
  applyMigrations,
  rollbackAllMigrations,
} from "../../scripts/db/migrations";
import { seedSyntheticData, SYNTHETIC_DATA } from "../../scripts/db/seed";

const migrationUrl = readDatabaseUrl("migration");
const applicationUrl = readDatabaseUrl("application");

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

async function fixture(
  input: Pick<AuthSession, "userId" | "identitySubject" | "email" | "displayName" |
    "audience" | "assuranceLevel" | "activeTenantId" | "activeTenantName">,
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

function expectOperationCode(code: OperationValidationError["code"]) {
  return (error: unknown) =>
    error instanceof OperationValidationError && error.code === code;
}

test("Etapa 8A keeps content versioned, private and tenant isolated", async (t) => {
  await rollbackAllMigrations(migrationUrl);
  await applyMigrations(migrationUrl);
  await seedSyntheticData(migrationUrl);

  const migrationPool = createDatabasePool({
    connectionString: migrationUrl,
    applicationName: "nexi-content-migration-tests",
    maxConnections: 1,
  });
  const applicationPool = createDatabasePool({
    connectionString: applicationUrl,
    applicationName: "nexi-content-application-tests",
    maxConnections: 1,
  });
  t.after(async () => {
    await migrationPool.end();
    await applicationPool.end();
  });

  await migrationPool.query(
    `UPDATE public.tenant_memberships SET status='active' WHERE id=$1`,
    [SYNTHETIC_DATA.membershipDisabled.id],
  );
  await migrationPool.query(
    `UPDATE public.tenants SET status='active' WHERE id=$1`,
    [SYNTHETIC_DATA.tenantSuspended.id],
  );
  const [clientA, clientB, admin, suspendedClient, disabledClient] =
    await Promise.all([
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
      fixture({
        userId: SYNTHETIC_DATA.userSuspended.id,
        identitySubject: SYNTHETIC_DATA.identitySuspended.providerSubject,
        email: SYNTHETIC_DATA.userSuspended.email,
        displayName: SYNTHETIC_DATA.userSuspended.displayName,
        audience: "client_admin",
        assuranceLevel: "aal1",
        activeTenantId: SYNTHETIC_DATA.tenantSuspended.id,
        activeTenantName: SYNTHETIC_DATA.tenantSuspended.displayName,
      }),
      fixture({
        userId: SYNTHETIC_DATA.userDisabledMembership.id,
        identitySubject: SYNTHETIC_DATA.identityDisabledMembership.providerSubject,
        email: SYNTHETIC_DATA.userDisabledMembership.email,
        displayName: SYNTHETIC_DATA.userDisabledMembership.displayName,
        audience: "client_admin",
        assuranceLevel: "aal1",
        activeTenantId: SYNTHETIC_DATA.tenantDisabledMembership.id,
        activeTenantName: SYNTHETIC_DATA.tenantDisabledMembership.displayName,
      }),
    ]);
  await migrationPool.query(
    `UPDATE public.tenant_memberships SET status='disabled' WHERE id=$1`,
    [SYNTHETIC_DATA.membershipDisabled.id],
  );
  await migrationPool.query(
    `UPDATE public.tenants SET status='suspended' WHERE id=$1`,
    [SYNTHETIC_DATA.tenantSuspended.id],
  );

  await t.test("only AAL2 nexi_admin assigns compatible active templates", async () => {
    const assignmentForm = form({
      site_id: SYNTHETIC_DATA.siteA.id,
      template_version_id: SYNTHETIC_DATA.templateRestaurantV1.id,
      idempotency_key: randomUUID(),
      assignment_version: "1",
    });
    assert.equal(
      await adminAssignTemplate(admin, assignmentForm, "template-idempotent-a"),
      SYNTHETIC_DATA.siteA.id,
    );
    assert.equal(
      await adminAssignTemplate(admin, assignmentForm, "template-idempotent-b"),
      SYNTHETIC_DATA.siteA.id,
    );
    await assert.rejects(
      adminAssignTemplate(clientA, assignmentForm, "template-client-denied"),
      expectOperationCode("denied"),
    );

    await migrationPool.query(
      `INSERT INTO public.template_versions(
         id,template_id,version,renderer_key,content_schema_key,
         minimum_schema_version,maximum_schema_version,status
       ) VALUES
         ('a8333333-3333-4333-8333-333333333333',$1,2,
          'restaurant-classic-v1','restaurant.v1',1,1,'retired'),
         ('a8444444-4444-4444-8444-444444444444',$1,3,
          'unknown-renderer','restaurant.v1',1,1,'active'),
         ('a8555555-5555-4555-8555-555555555555',$1,4,
          'restaurant-classic-v1','restaurant.v2',2,2,'active')`,
      [SYNTHETIC_DATA.templateRestaurant.id],
    );
    for (const templateVersionId of [
      "a8333333-3333-4333-8333-333333333333",
      "a8444444-4444-4444-8444-444444444444",
      "a8555555-5555-4555-8555-555555555555",
    ]) {
      await assert.rejects(
        adminAssignTemplate(
          admin,
          form({
            site_id: SYNTHETIC_DATA.siteA.id,
            template_version_id: templateVersionId,
            idempotency_key: randomUUID(),
            assignment_version: "1",
          }),
          `template-rejected-${templateVersionId}`,
        ),
        (error: unknown) =>
          error instanceof OperationValidationError &&
          ["invalid", "not_found"].includes(error.code),
      );
    }
  });

  await t.test("initialization is explicit, idempotent and never publishes", async () => {
    const siteId = await adminCreateSite(
      admin,
      form({
        tenant_id: SYNTHETIC_DATA.tenantA.id,
        display_name: "Restaurante Inicial Ficticio",
        slug: "restaurante-inicial-ficticio",
        idempotency_key: randomUUID(),
      }),
      "content-site-create",
    );
    await adminAssignTemplate(
      admin,
      form({
        site_id: siteId,
        template_version_id: SYNTHETIC_DATA.templateRestaurantV1.id,
        idempotency_key: randomUUID(),
      }),
      "content-template-assign",
    );
    const initializeForm = form({
      site_id: siteId,
      idempotency_key: randomUUID(),
    });
    assert.equal(
      await adminInitializeContent(admin, initializeForm, "content-initialize-a"),
      siteId,
    );
    assert.equal(
      await adminInitializeContent(admin, initializeForm, "content-initialize-b"),
      siteId,
    );
    const counts = await migrationPool.query<{ drafts: number; publications: number }>(
      `SELECT
         (SELECT count(*)::int FROM public.site_content_drafts WHERE site_id=$1) AS drafts,
         (SELECT count(*)::int FROM public.site_content_publications
          WHERE site_id=$1) AS publications`,
      [siteId],
    );
    assert.deepEqual(counts.rows[0], { drafts: 1, publications: 0 });
    assert.equal((await resolvePublicSite({ siteSlug: "restaurante-inicial-ficticio" }))
      ?.publicState, "preparing");
  });

  let firstPublicationId = "";
  let savedRevision = 0;
  let savedContent!: RestaurantContent;

  await t.test("draft save is idempotent and detects concurrent edits", async () => {
    const workspace = await clientContentWorkspace(clientB, SYNTHETIC_DATA.siteB.id);
    assert.ok(workspace?.draft);
    firstPublicationId = workspace.publications.at(-1)?.id ?? "";
    const next = structuredClone(workspace.draft.content) as RestaurantContent;
    next.identity.business_name = "Borrador Taller Laguna 8A";
    next.hero.headline = "Titular exclusivo del borrador 8A";
    savedContent = next;
    const key = randomUUID();
    const saveForm = form({
      site_id: SYNTHETIC_DATA.siteB.id,
      revision: String(workspace.draft.revision),
      idempotency_key: key,
      content_json: JSON.stringify(next),
    });
    assert.equal(
      await saveContentDraft(clientB, saveForm, "content-save-a"),
      SYNTHETIC_DATA.siteB.id,
    );
    assert.equal(
      await saveContentDraft(clientB, saveForm, "content-save-replay"),
      SYNTHETIC_DATA.siteB.id,
    );
    savedRevision = workspace.draft.revision + 1;
    await assert.rejects(
      saveContentDraft(
        clientB,
        form({
          site_id: SYNTHETIC_DATA.siteB.id,
          revision: String(workspace.draft.revision),
          idempotency_key: randomUUID(),
          content_json: JSON.stringify(next),
        }),
        "content-save-conflict",
      ),
      expectOperationCode("conflict"),
    );
    const after = await clientContentWorkspace(clientB, SYNTHETIC_DATA.siteB.id);
    assert.equal(after?.draft?.revision, savedRevision);
  });

  await t.test("preview is private and does not alter the public publication", async () => {
    const preview = await clientPreviewContent(clientB, SYNTHETIC_DATA.siteB.id);
    assert.equal(preview?.draft.content.hero.headline, savedContent.hero.headline);
    assert.equal(
      await clientPreviewContent(clientA, SYNTHETIC_DATA.siteB.id),
      null,
    );
    const before = await resolvePublicSite({ hostname: "taller-laguna.nexi.cl" });
    assert.equal(before?.publicState, "published");
    assert.notEqual(before?.content?.hero.headline, savedContent.hero.headline);
    assert.equal(before?.canonicalHostname, "taller-laguna.nexi.cl");
  });

  let secondPublicationId = "";
  await t.test("publish creates one immutable snapshot and atomically moves the pointer", async () => {
    const key = randomUUID();
    const publishForm = form({
      site_id: SYNTHETIC_DATA.siteB.id,
      revision: String(savedRevision),
      idempotency_key: key,
    });
    assert.equal(
      await publishContent(clientB, publishForm, "content-publish-a"),
      SYNTHETIC_DATA.siteB.id,
    );
    assert.equal(
      await publishContent(clientB, publishForm, "content-publish-replay"),
      SYNTHETIC_DATA.siteB.id,
    );
    const publications = await migrationPool.query<{
      id: string;
      publicationNumber: number;
      headline: string;
      current: boolean;
    }>(
      `SELECT publication.id,
         publication.publication_number AS "publicationNumber",
         publication.content_snapshot->'hero'->>'headline' AS headline,
         site.current_publication_id=publication.id AS current
       FROM public.site_content_publications publication
       JOIN public.sites site ON site.id=publication.site_id
       WHERE publication.site_id=$1
       ORDER BY publication.publication_number`,
      [SYNTHETIC_DATA.siteB.id],
    );
    assert.equal(publications.rowCount, 2);
    assert.equal(publications.rows[1].publicationNumber, 2);
    assert.equal(publications.rows[1].headline, savedContent.hero.headline);
    assert.equal(publications.rows[1].current, true);
    secondPublicationId = publications.rows[1].id;
    await assert.rejects(
      migrationPool.query(
        `UPDATE public.site_content_publications
         SET publication_number=99 WHERE id=$1`,
        [firstPublicationId],
      ),
      (error: unknown) => (error as { code?: string }).code === "42501",
    );
    const publicAfter = await resolvePublicSite({
      hostname: "taller-laguna.nexi.cl",
    });
    assert.equal(publicAfter?.publicationId, secondPublicationId);
    assert.equal(publicAfter?.content?.hero.headline, savedContent.hero.headline);
  });

  await t.test("restore appends a third publication and preserves history", async () => {
    await restorePublication(
      clientB,
      form({
        site_id: SYNTHETIC_DATA.siteB.id,
        publication_id: firstPublicationId,
        idempotency_key: randomUUID(),
      }),
      "content-restore",
    );
    const history = await migrationPool.query<{
      id: string;
      publicationNumber: number;
      restoredFrom: string | null;
      current: boolean;
    }>(
      `SELECT publication.id,
         publication.publication_number AS "publicationNumber",
         publication.restored_from_publication_id AS "restoredFrom",
         site.current_publication_id=publication.id AS current
       FROM public.site_content_publications publication
       JOIN public.sites site ON site.id=publication.site_id
       WHERE publication.site_id=$1
       ORDER BY publication.publication_number`,
      [SYNTHETIC_DATA.siteB.id],
    );
    assert.equal(history.rowCount, 3);
    assert.equal(history.rows[2].publicationNumber, 3);
    assert.equal(history.rows[2].restoredFrom, firstPublicationId);
    assert.equal(history.rows[2].current, true);
    assert.ok(history.rows.some((row) => row.id === secondPublicationId));
  });

  await t.test("public resolver fails closed for inactive and unknown sites", async () => {
    assert.equal(
      (await resolvePublicSite({ siteSlug: SYNTHETIC_DATA.siteSuspended.slug }))
        ?.publicState,
      "unavailable",
    );
    assert.equal(await resolvePublicSite({ hostname: "unknown.example.invalid" }), null);
    assert.equal(await resolvePublicSite({ siteSlug: "../private" }), null);
  });

  await t.test("RLS and operation context reject known cross-tenant UUIDs", async () => {
    assert.equal(await clientContentWorkspace(clientA, SYNTHETIC_DATA.siteB.id), null);
    await withClientOperation(clientA, "content-rls-direct", async (client) => {
      const drafts = await client.query(
        `SELECT id FROM public.site_content_drafts WHERE site_id=$1`,
        [SYNTHETIC_DATA.siteB.id],
      );
      const publications = await client.query(
        `SELECT id FROM public.site_content_publications WHERE site_id=$1`,
        [SYNTHETIC_DATA.siteB.id],
      );
      assert.equal(drafts.rowCount, 0);
      assert.equal(publications.rowCount, 0);
    });
    const workspace = await clientContentWorkspace(clientB, SYNTHETIC_DATA.siteB.id);
    assert.ok(workspace?.draft);
    const blockedForm = form({
      site_id: SYNTHETIC_DATA.siteB.id,
      revision: String(workspace.draft.revision),
      idempotency_key: randomUUID(),
      content_json: JSON.stringify(workspace.draft.content),
    });
    await assert.rejects(
      saveContentDraft(suspendedClient, blockedForm, "content-suspended-tenant"),
      expectOperationCode("denied"),
    );
    await assert.rejects(
      saveContentDraft(disabledClient, blockedForm, "content-disabled-membership"),
      expectOperationCode("denied"),
    );
  });

  await t.test("suspended and archived sites cannot publish", async () => {
    const workspace = await clientContentWorkspace(clientB, SYNTHETIC_DATA.siteB.id);
    assert.ok(workspace?.draft);
    const original = await migrationPool.query<{ status: string }>(
      `SELECT status FROM public.sites WHERE id=$1`,
      [SYNTHETIC_DATA.siteB.id],
    );
    assert.equal(original.rows[0]?.status, "active");
    try {
      for (const status of ["suspended", "archived"]) {
        await migrationPool.query(
          `UPDATE public.sites SET status=$2 WHERE id=$1`,
          [SYNTHETIC_DATA.siteB.id, status],
        );
        await assert.rejects(
          publishContent(
            clientB,
            form({
              site_id: SYNTHETIC_DATA.siteB.id,
              revision: String(workspace.draft.revision),
              idempotency_key: randomUUID(),
            }),
            `content-publish-${status}`,
          ),
          expectOperationCode("invalid"),
        );
        assert.equal(
          (await resolvePublicSite({ hostname: "taller-laguna.nexi.cl" }))
            ?.publicState,
          "unavailable",
        );
      }
    } finally {
      await migrationPool.query(
        `UPDATE public.sites SET status=$2 WHERE id=$1`,
        [SYNTHETIC_DATA.siteB.id, original.rows[0].status],
      );
    }
    const restored = await migrationPool.query<{ status: string }>(
      `SELECT status FROM public.sites WHERE id=$1`,
      [SYNTHETIC_DATA.siteB.id],
    );
    assert.equal(restored.rows[0]?.status, "active");
  });

  const role = await applicationPool.query<{ bypass: boolean }>(
    `SELECT rolbypassrls AS bypass FROM pg_catalog.pg_roles WHERE rolname=current_user`,
  );
  assert.equal(role.rows[0].bypass, false);
});
