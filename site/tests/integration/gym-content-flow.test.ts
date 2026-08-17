import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createAuthSession } from "../../src/auth/auth-repository.server";
import { createSessionToken, hashSessionToken } from "../../src/auth/security";
import type { AuthSession } from "../../src/auth/types";
import {
  adminPreviewAlternativeTemplate,
  clientCompatibleTemplates,
  clientChangeTemplate,
  clientContentWorkspace,
  clientPreviewAlternativeTemplate,
  clientPreviewContent,
  publishContentTransaction,
  restorePublication,
  saveContentDraft,
} from "../../src/content/service.server";
import { readDatabaseUrl } from "../../src/db/config";
import { createDatabasePool } from "../../src/db/pool";
import { withClientOperation } from "../../src/operations/contexts.server";
import { applyMigrations, rollbackAllMigrations } from "../../scripts/db/migrations";
import { seedSyntheticData, SYNTHETIC_DATA } from "../../scripts/db/seed";
import {
  GYM_FIXTURE_IDS,
  completeGymV1Fixture,
  minimumGymV1Fixture,
} from "../fixtures/gym-v1";

const GYM_SITE_ID = "94000000-0000-4000-8000-000000000001";
const GYM_DRAFT_ID = "94000000-0000-4000-8000-000000000002";
const GYM_ASSET_ID = "94000000-0000-4000-8000-000000000003";
const OTHER_GYM_SITE_ID = "94000000-0000-4000-8000-000000000004";
const OTHER_TENANT_ASSET_ID = "94000000-0000-4000-8000-000000000005";
const MISSING_ASSET_ID = "94000000-0000-4000-8000-000000000006";

async function sessionFor(
  input: Pick<AuthSession, "userId" | "identitySubject" | "email" | "displayName" |
    "activeTenantId" | "activeTenantName">,
): Promise<AuthSession> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const sessionId = await createAuthSession({
    tokenHash: hashSessionToken(token),
    userId: input.userId,
    identityProvider: "test",
    identitySubject: input.identitySubject,
    audience: "client_admin",
    assuranceLevel: "aal1",
    activeTenantId: input.activeTenantId,
    expiresAt,
    userAgentHash: null,
    ipHash: null,
  });
  return {
    ...input,
    sessionId,
    identityProvider: "test",
    audience: "client_admin",
    assuranceLevel: "aal1",
    expiresAt,
  };
}

async function adminSession(): Promise<AuthSession> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const sessionId = await createAuthSession({
    tokenHash: hashSessionToken(token),
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

function saveForm(
  siteId: string,
  revision: number,
  content: unknown,
  idempotencyKey: string,
): FormData {
  const form = new FormData();
  form.set("site_id", siteId);
  form.set("revision", String(revision));
  form.set("content_json", JSON.stringify(content));
  form.set("idempotency_key", idempotencyKey);
  return form;
}

async function insertReadyAsset(
  pool: ReturnType<typeof createDatabasePool>,
  input: { assetId: string; tenantId: string; siteId: string; userId: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO public.media_assets(
       id,tenant_id,site_id,source_kind,storage_provider,storage_key,
       original_filename,display_name,default_alt_text,detected_mime_type,
       normalized_mime_type,byte_size,width,height,pixel_count,checksum_sha256,
       status,uploaded_by_user_id,upload_idempotency_key
     ) VALUES(
       $1,$2,$3,'uploaded','local',$4,
       'hero.webp','Hero Gym','', 'image/webp','image/webp',1000,100,100,10000,
       repeat('a',64),'ready',$5,$6
     )`,
    [
      input.assetId,
      input.tenantId,
      input.siteId,
      `tenants/${input.tenantId}/assets/${input.assetId}/hero.webp`,
      input.userId,
      randomUUID(),
    ],
  );
  for (const [index, variant] of ["thumbnail", "card", "hero"].entries()) {
    await pool.query(
      `INSERT INTO public.media_variants(
         tenant_id,site_id,asset_id,variant_name,storage_provider,storage_key,
         mime_type,byte_size,width,height,checksum_sha256,status
       ) VALUES($1,$2,$3,$4,'local',$5,'image/webp',500,100,100,repeat($6,64),'ready')`,
      [
        input.tenantId,
        input.siteId,
        input.assetId,
        variant,
        `tenants/${input.tenantId}/assets/${input.assetId}/${variant}.webp`,
        String(index + 1),
      ],
    );
  }
}

async function cleanupGymFixtures(
  pool: ReturnType<typeof createDatabasePool>,
): Promise<void> {
  await pool.query(
    `DELETE FROM public.content_media_references
     WHERE site_id IN ($1,$2) OR asset_id IN ($3,$4)`,
    [GYM_SITE_ID, OTHER_GYM_SITE_ID, GYM_ASSET_ID, OTHER_TENANT_ASSET_ID],
  );
  await pool.query(
    `DELETE FROM public.media_variants
     WHERE asset_id=$1 OR asset_id IN (
       SELECT id FROM public.media_assets WHERE site_id IN ($2,$3)
     )`,
    [OTHER_TENANT_ASSET_ID, GYM_SITE_ID, OTHER_GYM_SITE_ID],
  );
  await pool.query(
    `DELETE FROM public.media_assets
     WHERE id=$1 OR site_id IN ($2,$3)`,
    [OTHER_TENANT_ASSET_ID, GYM_SITE_ID, OTHER_GYM_SITE_ID],
  );
  await pool.query(
    `DELETE FROM public.site_content_drafts WHERE site_id IN ($1,$2)`,
    [GYM_SITE_ID, OTHER_GYM_SITE_ID],
  );
  await pool.query(
    `DELETE FROM public.sites WHERE id IN ($1,$2)`,
    [GYM_SITE_ID, OTHER_GYM_SITE_ID],
  );
}

test("gym.v1 exposes only an isolated private preview while mutations stay closed", async (t) => {
  const migrationUrl = readDatabaseUrl("migration");
  const cleanupPool = createDatabasePool({
    connectionString: migrationUrl,
    applicationName: "nexi-gym-v1-pre-cleanup",
    maxConnections: 1,
  });
  await cleanupGymFixtures(cleanupPool).catch((error: unknown) => {
    if ((error as { code?: string }).code !== "42P01") throw error;
  });
  await cleanupPool.end();
  await rollbackAllMigrations(migrationUrl);
  await applyMigrations(migrationUrl);
  await seedSyntheticData(migrationUrl);
  const pool = createDatabasePool({
    connectionString: migrationUrl,
    applicationName: "nexi-gym-v1-content-tests",
    maxConnections: 2,
  });
  t.after(async () => {
    await cleanupGymFixtures(pool);
    await pool.end();
  });

  const initial = minimumGymV1Fixture();
  await pool.query(
    `INSERT INTO public.sites(id,tenant_id,display_name,slug,status,industry_key)
     VALUES($1,$2,'Gym sintético','gym-sintetico','active','gym'),
           ($3,$2,'Gym alternativo','gym-alternativo','preparing','gym')`,
    [GYM_SITE_ID, SYNTHETIC_DATA.tenantB.id, OTHER_GYM_SITE_ID],
  );
  await pool.query(
    `INSERT INTO public.site_content_drafts(
       id,tenant_id,site_id,schema_key,schema_version,content,revision,
       created_by_user_id,updated_by_user_id,last_idempotency_key
     ) VALUES($1,$2,$3,'gym.v1',1,$4::jsonb,1,$5,$5,$6)`,
    [
      GYM_DRAFT_ID,
      SYNTHETIC_DATA.tenantB.id,
      GYM_SITE_ID,
      JSON.stringify(initial),
      SYNTHETIC_DATA.userB.id,
      randomUUID(),
    ],
  );

  await assert.rejects(
    pool.query(
      `UPDATE public.site_content_drafts
       SET schema_key='restaurant.v1',schema_version=1 WHERE id=$1`,
      [GYM_DRAFT_ID],
    ),
    (error: unknown) => (error as { code?: string }).code === "23514",
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO public.site_content_drafts(
         tenant_id,site_id,schema_key,schema_version,content,created_by_user_id,
         updated_by_user_id,last_idempotency_key
       ) VALUES($1,$2,'restaurant.v1',1,'{}'::jsonb,$3,$3,$4)`,
      [SYNTHETIC_DATA.tenantB.id, OTHER_GYM_SITE_ID, SYNTHETIC_DATA.userB.id, randomUUID()],
    ),
    (error: unknown) => (error as { code?: string }).code === "23514",
  );

  const [clientA, clientB, admin] = await Promise.all([
    sessionFor({
      userId: SYNTHETIC_DATA.userA.id,
      identitySubject: SYNTHETIC_DATA.identityA.providerSubject,
      email: SYNTHETIC_DATA.userA.email,
      displayName: SYNTHETIC_DATA.userA.displayName,
      activeTenantId: SYNTHETIC_DATA.tenantA.id,
      activeTenantName: SYNTHETIC_DATA.tenantA.displayName,
    }),
    sessionFor({
      userId: SYNTHETIC_DATA.userB.id,
      identitySubject: SYNTHETIC_DATA.identityB.providerSubject,
      email: SYNTHETIC_DATA.userB.email,
      displayName: SYNTHETIC_DATA.userB.displayName,
      activeTenantId: SYNTHETIC_DATA.tenantB.id,
      activeTenantName: SYNTHETIC_DATA.tenantB.displayName,
    }),
    adminSession(),
  ]);

  assert.equal(await clientContentWorkspace(clientA, GYM_SITE_ID), null);
  await assert.rejects(
    saveContentDraft(
      clientA,
      saveForm(GYM_SITE_ID, 1, initial, randomUUID()),
      "gym-v1-cross-tenant-save",
    ),
  );
  assert.equal(
    (await pool.query(`SELECT revision FROM public.site_content_drafts WHERE id=$1`, [
      GYM_DRAFT_ID,
    ])).rows[0].revision,
    1,
  );
  await assert.rejects(
    withClientOperation(clientB, "gym-v1-industry-mutation", (client) =>
      client.query(
        `UPDATE public.sites SET industry_key='restaurant',version=version+1
         WHERE id=$1`,
        [GYM_SITE_ID],
      )
    ),
    (error: unknown) => (error as { code?: string }).code === "42501",
  );
  const workspace = await clientContentWorkspace(clientB, GYM_SITE_ID);
  assert.equal(workspace?.industryKey, "gym");
  assert.equal(workspace?.draft?.schemaKey, "gym.v1");
  assert.equal(workspace?.assignment, null);
  const gymCatalog = await clientCompatibleTemplates(clientB, GYM_SITE_ID);
  assert.equal(gymCatalog?.currentTemplateVersionId, null);
  assert.deepEqual(gymCatalog?.options.map((option) => option.templateKey), ["gym-pulso"]);
  const pulso = gymCatalog?.options[0];
  assert.ok(pulso);
  assert.equal(pulso.rendererKey, "gym-pulso-v1");
  assert.equal(pulso.schemaKey, "gym.v1");
  const previewWithoutMedia = await clientPreviewAlternativeTemplate(
    clientB,
    GYM_SITE_ID,
    pulso.id,
  );
  assert.deepEqual(previewWithoutMedia?.draft.content, initial);
  assert.deepEqual(previewWithoutMedia?.media, {});
  assert.equal(
    await clientPreviewAlternativeTemplate(clientA, GYM_SITE_ID, pulso.id),
    null,
  );
  assert.equal(
    await clientPreviewAlternativeTemplate(
      clientB,
      SYNTHETIC_DATA.siteB.id,
      pulso.id,
    ),
    null,
  );
  assert.equal(
    await clientPreviewAlternativeTemplate(
      clientB,
      GYM_SITE_ID,
      SYNTHETIC_DATA.templateRestaurantV2.id,
    ),
    null,
  );
  assert.equal(
    await clientPreviewAlternativeTemplate(
      clientB,
      GYM_SITE_ID,
      "99999999-9999-4999-8999-999999999999",
    ),
    null,
  );
  const selection = new FormData();
  selection.set("site_id", GYM_SITE_ID);
  selection.set("template_version_id", pulso.id);
  selection.set("assignment_version", "0");
  selection.set("idempotency_key", randomUUID());
  await assert.rejects(
    clientChangeTemplate(clientB, selection, "gym-preview-selection-denied"),
  );
  assert.equal(await clientPreviewContent(clientB, GYM_SITE_ID), null);

  const idempotencyKey = randomUUID();
  await saveContentDraft(
    clientB,
    saveForm(GYM_SITE_ID, 1, initial, idempotencyKey),
    "gym-v1-save",
  );
  await saveContentDraft(
    clientB,
    saveForm(GYM_SITE_ID, 1, initial, idempotencyKey),
    "gym-v1-save-replay",
  );
  const saved = await pool.query<{ revision: number }>(
    `SELECT revision FROM public.site_content_drafts WHERE id=$1`,
    [GYM_DRAFT_ID],
  );
  assert.equal(saved.rows[0].revision, 2);

  const publicationClient = await pool.connect();
  const publish = await publishContentTransaction(publicationClient, {
    tenantId: SYNTHETIC_DATA.tenantB.id,
    actorUserId: SYNTHETIC_DATA.userB.id,
    siteId: GYM_SITE_ID,
    expectedRevision: 2,
    idempotencyKey: randomUUID(),
  }).finally(() => publicationClient.release());
  assert.notEqual(publish.rejected, null);
  assert.equal(
    (await pool.query(
      `SELECT count(*)::int AS count FROM public.site_content_publications
       WHERE site_id=$1`,
      [GYM_SITE_ID],
    )).rows[0].count,
    0,
  );
  const restaurantPublication = await pool.query<{ id: string }>(
    `SELECT id FROM public.site_content_publications
     WHERE site_id=$1 ORDER BY publication_number LIMIT 1`,
    [SYNTHETIC_DATA.siteB.id],
  );
  const restore = new FormData();
  restore.set("site_id", GYM_SITE_ID);
  restore.set("publication_id", restaurantPublication.rows[0].id);
  restore.set("idempotency_key", randomUUID());
  await assert.rejects(
    restorePublication(clientB, restore, "gym-preview-restore-denied"),
  );

  const invalidMedia = minimumGymV1Fixture();
  invalidMedia.hero.media = {
    assetId: MISSING_ASSET_ID,
    altText: "Activo inexistente",
    decorative: false,
  };
  await assert.rejects(
    saveContentDraft(
      clientB,
      saveForm(GYM_SITE_ID, 2, invalidMedia, randomUUID()),
      "gym-v1-missing-media",
    ),
  );
  await insertReadyAsset(pool, {
    assetId: OTHER_TENANT_ASSET_ID,
    tenantId: SYNTHETIC_DATA.tenantA.id,
    siteId: SYNTHETIC_DATA.siteA.id,
    userId: SYNTHETIC_DATA.userA.id,
  });
  invalidMedia.hero.media.assetId = OTHER_TENANT_ASSET_ID;
  await assert.rejects(
    saveContentDraft(
      clientB,
      saveForm(GYM_SITE_ID, 2, invalidMedia, randomUUID()),
      "gym-v1-cross-tenant-media",
    ),
  );
  assert.equal(
    (await pool.query(`SELECT revision FROM public.site_content_drafts WHERE id=$1`, [
      GYM_DRAFT_ID,
    ])).rows[0].revision,
    2,
  );
  await insertReadyAsset(pool, {
    assetId: GYM_ASSET_ID,
    tenantId: SYNTHETIC_DATA.tenantB.id,
    siteId: GYM_SITE_ID,
    userId: SYNTHETIC_DATA.userB.id,
  });
  const withMedia = completeGymV1Fixture();
  withMedia.identity.logo = null;
  withMedia.hero.media = {
    assetId: GYM_ASSET_ID,
    altText: "Entrenamiento en Gym sintético",
    decorative: false,
  };
  withMedia.classes[0].media = null;
  withMedia.trainers[0].media = null;
  withMedia.facilities[0].media = null;
  withMedia.gallery = [];
  await saveContentDraft(
    clientB,
    saveForm(GYM_SITE_ID, 2, withMedia, randomUUID()),
    "gym-v1-media-save",
  );
  const previewWithMedia = await clientPreviewAlternativeTemplate(
    clientB,
    GYM_SITE_ID,
    pulso.id,
  );
  assert.equal(
    previewWithMedia?.media[GYM_ASSET_ID]?.hero?.url.includes(GYM_ASSET_ID),
    true,
  );
  assert.equal(
    previewWithMedia?.media[GYM_ASSET_ID]?.hero?.url,
    `/api/media/private/${GYM_ASSET_ID}/hero`,
  );
  const adminPreviewWithMedia = await adminPreviewAlternativeTemplate(
    admin,
    GYM_SITE_ID,
    pulso.id,
  );
  assert.equal(
    adminPreviewWithMedia?.media[GYM_ASSET_ID]?.hero?.url,
    `/api/media/private/${GYM_ASSET_ID}/hero?audience=admin`,
  );
  for (const assetId of [
    GYM_FIXTURE_IDS.logo,
    GYM_FIXTURE_IDS.hero,
    GYM_FIXTURE_IDS.class,
    GYM_FIXTURE_IDS.trainerMedia,
    GYM_FIXTURE_IDS.facility,
    GYM_FIXTURE_IDS.gallery,
  ]) {
    await insertReadyAsset(pool, {
      assetId,
      tenantId: SYNTHETIC_DATA.tenantB.id,
      siteId: GYM_SITE_ID,
      userId: SYNTHETIC_DATA.userB.id,
    });
  }
  await saveContentDraft(
    clientB,
    saveForm(GYM_SITE_ID, 3, completeGymV1Fixture(), randomUUID()),
    "gym-v1-full-media-save",
  );
  const previewWithFullMedia = await clientPreviewAlternativeTemplate(
    clientB,
    GYM_SITE_ID,
    pulso.id,
  );
  assert.deepEqual(
    Object.keys(previewWithFullMedia?.media ?? {}).sort(),
    [
      GYM_FIXTURE_IDS.logo,
      GYM_FIXTURE_IDS.hero,
      GYM_FIXTURE_IDS.class,
      GYM_FIXTURE_IDS.trainerMedia,
      GYM_FIXTURE_IDS.facility,
      GYM_FIXTURE_IDS.gallery,
    ].sort(),
  );
  assert.deepEqual(
    (await pool.query<{ fieldPath: string }>(
      `SELECT field_path AS "fieldPath" FROM public.content_media_references
       WHERE draft_id=$1 ORDER BY field_path`,
      [GYM_DRAFT_ID],
    )).rows,
    [
      { fieldPath: "classes.0.media" },
      { fieldPath: "facilities.0.media" },
      { fieldPath: "gallery.0.media" },
      { fieldPath: "hero.media" },
      { fieldPath: "identity.logo" },
      { fieldPath: "trainers.0.media" },
    ],
  );
  await assert.rejects(
    pool.query(
      `UPDATE public.content_media_references SET field_path='menu.items.0.media'
       WHERE draft_id=$1`,
      [GYM_DRAFT_ID],
    ),
    (error: unknown) => (error as { code?: string }).code === "23514",
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO public.content_media_references(
         tenant_id,site_id,owner_kind,draft_id,field_path,asset_id,alt_text,decorative
       ) VALUES($1,$2,'draft',$3,'hero.media',$4,'Duplicado',false)`,
      [SYNTHETIC_DATA.tenantB.id, GYM_SITE_ID, GYM_DRAFT_ID, GYM_ASSET_ID],
    ),
    (error: unknown) => (error as { code?: string }).code === "23505",
  );
});
