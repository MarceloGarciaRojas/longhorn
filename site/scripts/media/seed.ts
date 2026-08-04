import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg, { type PoolClient } from "pg";
// @ts-expect-error sharp 0.35 does not expose its bundled types through exports
import sharp from "sharp";

import {
  migrateRestaurantV1ToV2,
  validateRestaurantV2Content,
} from "../../src/content/restaurant-v2-schema";
import type {
  RestaurantContent,
  RestaurantContentV2,
} from "../../src/content/types";
import {
  assertSafeResetTarget,
  readDatabaseUrl,
} from "../../src/db/config";
import type {
  ObjectStorage,
  StoredObject,
  StoredObjectHead,
} from "../../src/media/storage";
import { SYNTHETIC_DATA } from "../db/seed";
import { LocalObjectStorage } from "./local-storage";
import { processMediaBytes } from "./processor";

const SEED_VERSION = "8b.1";
const TARGET_DRAFT_KEY = stableUuid(`${SYNTHETIC_DATA.siteB.id}:v2-draft`);
const REFERENCES = [
  "restaurant-hero",
  "restaurant-dish-a",
  "restaurant-dish-b",
  "restaurant-dessert",
] as const;
const EXPECTED_SITES = [
  { id: SYNTHETIC_DATA.siteA.id, tenantId: SYNTHETIC_DATA.tenantA.id },
  { id: SYNTHETIC_DATA.siteB.id, tenantId: SYNTHETIC_DATA.tenantB.id },
  { id: SYNTHETIC_DATA.siteA2.id, tenantId: SYNTHETIC_DATA.tenantA.id },
  { id: SYNTHETIC_DATA.siteB2.id, tenantId: SYNTHETIC_DATA.tenantB.id },
  {
    id: SYNTHETIC_DATA.siteSuspended.id,
    tenantId: SYNTHETIC_DATA.tenantSuspended.id,
  },
] as const;

type SeedFailurePoint = "after_first_asset";

export class MediaSeedError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MediaSeedError";
  }
}

export interface MediaSeedOptions {
  storage?: LocalObjectStorage;
  failurePoint?: SeedFailurePoint;
}

class SeedTrackingStorage implements ObjectStorage {
  private readonly createdKeys = new Set<string>();

  constructor(private readonly storage: ObjectStorage) {}

  async put(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<StoredObjectHead> {
    const existed = await this.storage.exists(key);
    const result = await this.storage.put(key, body, contentType);
    if (!existed) this.createdKeys.add(key);
    return result;
  }

  read(key: string): Promise<StoredObject> {
    return this.storage.read(key);
  }

  head(key: string): Promise<StoredObjectHead | null> {
    return this.storage.head(key);
  }

  exists(key: string): Promise<boolean> {
    return this.storage.exists(key);
  }

  async delete(key: string): Promise<void> {
    if (!this.createdKeys.has(key)) return;
    await this.storage.delete(key);
    this.createdKeys.delete(key);
  }

  async rollback(): Promise<void> {
    await Promise.all(
      [...this.createdKeys].map((key) =>
        this.storage.delete(key).catch(() => undefined),
      ),
    );
    this.createdKeys.clear();
  }

  commit(): void {
    this.createdKeys.clear();
  }
}

function stableUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${
    hex.slice(17, 20)
  }-${hex.slice(20)}`;
}

async function syntheticPng(label: string): Promise<Uint8Array> {
  const color = `#${createHash("sha256").update(label).digest("hex").slice(0, 6)}`;
  return sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 4,
      background: color,
    },
  }).png().toBuffer();
}

async function validatePreconditions(client: PoolClient): Promise<{
  sites: { id: string; tenantId: string }[];
  draft: {
    id: string;
    schemaKey: "restaurant.v1" | "restaurant.v2";
    schemaVersion: 1 | 2;
    content: RestaurantContent | RestaurantContentV2;
    lastIdempotencyKey: string;
  };
}> {
  const expectedTenantSlugs = new Map<string, string>([
    [SYNTHETIC_DATA.tenantA.id, SYNTHETIC_DATA.tenantA.slug],
    [SYNTHETIC_DATA.tenantB.id, SYNTHETIC_DATA.tenantB.slug],
    [
      SYNTHETIC_DATA.tenantSuspended.id,
      SYNTHETIC_DATA.tenantSuspended.slug,
    ],
  ]);
  const tenants = await client.query<{ id: string; slug: string }>(
    `SELECT id,slug FROM public.tenants WHERE id=ANY($1::uuid[])`,
    [[...expectedTenantSlugs.keys()]],
  );
  if (
    tenants.rowCount !== expectedTenantSlugs.size ||
    tenants.rows.some((tenant) => expectedTenantSlugs.get(tenant.id) !== tenant.slug)
  ) {
    throw new MediaSeedError("media_seed_synthetic_tenants_invalid");
  }

  const expectedSiteTenants = new Map<string, string>(
    EXPECTED_SITES.map((site) => [site.id, site.tenantId]),
  );
  const sites = await client.query<{
    id: string;
    tenantId: string;
    status: string;
    deletedAt: Date | null;
  }>(
    `SELECT id,tenant_id AS "tenantId",status,deleted_at AS "deletedAt"
     FROM public.sites WHERE id=ANY($1::uuid[]) ORDER BY id`,
    [[...expectedSiteTenants.keys()]],
  );
  if (
    sites.rowCount !== EXPECTED_SITES.length ||
    sites.rows.some((site) =>
      expectedSiteTenants.get(site.id) !== site.tenantId || site.deletedAt !== null
    )
  ) {
    throw new MediaSeedError("media_seed_synthetic_sites_invalid");
  }

  const target = await client.query<{
    siteStatus: string;
    tenantStatus: string;
    assignmentTemplateVersionId: string;
    assignmentSchemaKey: string;
    assignmentSchemaVersion: number;
    assignmentStatus: string;
    draftId: string;
    draftSchemaKey: string;
    draftSchemaVersion: number;
    draftContent: RestaurantContent | RestaurantContentV2;
    draftLastIdempotencyKey: string;
  }>(
    `SELECT site.status AS "siteStatus",tenant.status AS "tenantStatus",
       assignment.template_version_id AS "assignmentTemplateVersionId",
       assignment.schema_key AS "assignmentSchemaKey",
       assignment.schema_version AS "assignmentSchemaVersion",
       assignment.status AS "assignmentStatus",
       draft.id AS "draftId",draft.schema_key AS "draftSchemaKey",
       draft.schema_version AS "draftSchemaVersion",
       draft.content AS "draftContent",
       draft.last_idempotency_key AS "draftLastIdempotencyKey"
     FROM public.sites site
     JOIN public.tenants tenant ON tenant.id=site.tenant_id
     JOIN public.site_template_assignments assignment
       ON assignment.site_id=site.id
     JOIN public.site_content_drafts draft ON draft.site_id=site.id
     WHERE site.id=$1 AND site.tenant_id=$2`,
    [SYNTHETIC_DATA.siteB.id, SYNTHETIC_DATA.tenantB.id],
  );
  const row = target.rows[0];
  if (!row) throw new MediaSeedError("media_seed_target_missing");
  if (!["preparing", "active"].includes(row.siteStatus)) {
    throw new MediaSeedError("media_seed_site_not_editable_reset_required");
  }
  if (row.tenantStatus !== "active") {
    throw new MediaSeedError("media_seed_tenant_not_active");
  }
  if (row.assignmentStatus !== "active") {
    throw new MediaSeedError("media_seed_assignment_not_active");
  }
  if (
    row.assignmentSchemaKey !== row.draftSchemaKey ||
    row.assignmentSchemaVersion !== row.draftSchemaVersion
  ) {
    throw new MediaSeedError("media_seed_draft_assignment_mismatch");
  }
  const isV1 =
    row.draftSchemaKey === "restaurant.v1" &&
    row.draftSchemaVersion === 1 &&
    row.assignmentTemplateVersionId === SYNTHETIC_DATA.templateRestaurantV1.id;
  const isSeededV2 =
    row.draftSchemaKey === "restaurant.v2" &&
    row.draftSchemaVersion === 2 &&
    row.assignmentTemplateVersionId === SYNTHETIC_DATA.templateRestaurantV2.id &&
    row.draftLastIdempotencyKey === TARGET_DRAFT_KEY;
  if (!isV1 && !isSeededV2) {
    throw new MediaSeedError("media_seed_draft_state_requires_reset");
  }
  return {
    sites: sites.rows.map(({ id, tenantId }) => ({ id, tenantId })),
    draft: {
      id: row.draftId,
      schemaKey: row.draftSchemaKey as "restaurant.v1" | "restaurant.v2",
      schemaVersion: row.draftSchemaVersion as 1 | 2,
      content: row.draftContent,
      lastIdempotencyKey: row.draftLastIdempotencyKey,
    },
  };
}

async function seedBundledAssets(
  client: PoolClient,
  storage: SeedTrackingStorage,
  sites: { id: string; tenantId: string }[],
  failurePoint?: SeedFailurePoint,
): Promise<void> {
  let processedAssetCount = 0;
  for (const site of sites) {
    for (const reference of REFERENCES) {
      const stableAssetId = stableUuid(`${site.id}:${reference}`);
      const uploadId = stableUuid(`${stableAssetId}:upload`);
      const source = await syntheticPng(`${site.id}:${reference}`);
      const asset = await client.query<{ id: string }>(
        `INSERT INTO public.media_assets(
           id,tenant_id,site_id,source_kind,storage_provider,bundled_reference,
           original_filename,display_name,default_alt_text,
           detected_mime_type,byte_size,status,upload_idempotency_key
         ) VALUES($1,$2,$3,'bundled','local',$4,$5,$6,$6,'image/png',$7,'processing',$8)
         ON CONFLICT(site_id,bundled_reference) DO UPDATE SET
           status='processing',rejection_code=NULL,archived_at=NULL,
           archived_by_user_id=NULL,byte_size=EXCLUDED.byte_size
         RETURNING id`,
        [
          stableAssetId,
          site.tenantId,
          site.id,
          reference,
          `${reference}.png`,
          reference.replaceAll("-", " "),
          source.byteLength,
          uploadId,
        ],
      );
      const assetId = asset.rows[0].id;
      const processed = await processMediaBytes({
        tenantId: site.tenantId,
        siteId: site.id,
        assetId,
        filename: `${reference}.png`,
        declaredMimeType: "image/png",
        bytes: source,
        storage,
      });
      await client.query(
        `UPDATE public.media_assets SET storage_key=$2,
           detected_mime_type=$3,normalized_mime_type='image/webp',
           byte_size=$4,width=$5::integer,height=$6::integer,
           pixel_count=$5::bigint*$6::bigint,
           checksum_sha256=$7,status='ready',rejection_code=NULL,
           version=version+1 WHERE id=$1`,
        [
          assetId,
          processed.original.storageKey,
          processed.detectedMimeType,
          processed.original.byteSize,
          processed.original.width,
          processed.original.height,
          processed.original.checksum,
        ],
      );
      for (const [name, variant] of Object.entries(processed.variants)) {
        await client.query(
          `INSERT INTO public.media_variants(
             tenant_id,site_id,asset_id,variant_name,storage_provider,
             storage_key,mime_type,byte_size,width,height,checksum_sha256,status
           ) VALUES($1,$2,$3,$4,'local',$5,'image/webp',$6,$7,$8,$9,'ready')
           ON CONFLICT(asset_id,variant_name) DO UPDATE SET
             storage_key=EXCLUDED.storage_key,byte_size=EXCLUDED.byte_size,
             width=EXCLUDED.width,height=EXCLUDED.height,
             checksum_sha256=EXCLUDED.checksum_sha256,status='ready'`,
          [
            site.tenantId,
            site.id,
            assetId,
            name,
            variant.storageKey,
            variant.byteSize,
            variant.width,
            variant.height,
            variant.checksum,
          ],
        );
      }
      processedAssetCount += 1;
      if (failurePoint === "after_first_asset" && processedAssetCount === 1) {
        throw new MediaSeedError("media_seed_synthetic_failure");
      }
    }
  }
}

async function seedOperationalStates(client: PoolClient): Promise<void> {
  const tenantId = SYNTHETIC_DATA.tenantA.id;
  const siteId = SYNTHETIC_DATA.siteA.id;
  const actorId = SYNTHETIC_DATA.userAdmin.id;
  for (const status of ["processing", "rejected"] as const) {
    const id = stableUuid(`${siteId}:uploaded:${status}`);
    await client.query(
      `INSERT INTO public.media_assets(
         id,tenant_id,site_id,source_kind,storage_provider,original_filename,
         display_name,detected_mime_type,byte_size,status,rejection_code,
         uploaded_by_user_id,upload_idempotency_key
       ) VALUES($1,$2,$3,'uploaded','local',$4,$5,'image/jpeg',100,$6,$7,$8,$9)
       ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,
         rejection_code=EXCLUDED.rejection_code`,
      [
        id,
        tenantId,
        siteId,
        `synthetic-${status}.jpg`,
        `Sintética ${status}`,
        status,
        status === "rejected" ? "media_mime_mismatch" : null,
        actorId,
        stableUuid(`${id}:upload`),
      ],
    );
  }
}

async function insertReferences(
  client: PoolClient,
  input: {
    tenantId: string;
    siteId: string;
    content: RestaurantContentV2;
    draftId?: string;
    publicationId?: string;
  },
): Promise<void> {
  const values = [
    input.content.hero.media
      ? { path: "hero.media", usage: input.content.hero.media }
      : null,
    ...input.content.menu.items.map((item, index) =>
      item.media
        ? { path: `menu.items.${index}.media`, usage: item.media }
        : null),
  ].filter((value): value is NonNullable<typeof value> => value !== null);
  for (const value of values) {
    await client.query(
      `INSERT INTO public.content_media_references(
         tenant_id,site_id,owner_kind,draft_id,publication_id,field_path,
         asset_id,alt_text,decorative
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT DO NOTHING`,
      [
        input.tenantId,
        input.siteId,
        input.draftId ? "draft" : "publication",
        input.draftId ?? null,
        input.publicationId ?? null,
        value.path,
        value.usage.assetId,
        value.usage.altText,
        value.usage.decorative,
      ],
    );
  }
}

async function seedHistoricalPublication(
  client: PoolClient,
  input: {
    content: RestaurantContentV2;
    templateVersionId: string;
    index: number;
  },
): Promise<void> {
  const publicationId = stableUuid(
    `${SYNTHETIC_DATA.siteB.id}:v2-publication:${input.index}`,
  );
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM public.site_content_publications WHERE id=$1`,
    [publicationId],
  );
  if (!existing.rows[0]) {
    await client.query(
      `UPDATE public.site_template_assignments SET
         template_version_id=$2,idempotency_key=$3,version=version+1
       WHERE site_id=$1 AND template_version_id IS DISTINCT FROM $2`,
      [
        SYNTHETIC_DATA.siteB.id,
        input.templateVersionId,
        stableUuid(`${SYNTHETIC_DATA.siteB.id}:seed-template:${input.index}`),
      ],
    );
    const next = await client.query<{ number: number }>(
      `SELECT COALESCE(max(publication_number),0)+1 AS number
       FROM public.site_content_publications WHERE site_id=$1`,
      [SYNTHETIC_DATA.siteB.id],
    );
    await client.query(
      `INSERT INTO public.site_content_publications(
         id,tenant_id,site_id,template_version_id,schema_key,schema_version,
         content_snapshot,publication_number,published_by_user_id,idempotency_key
       ) VALUES($1,$2,$3,$4,'restaurant.v2',2,$5::jsonb,$6,$7,$8)`,
      [
        publicationId,
        SYNTHETIC_DATA.tenantB.id,
        SYNTHETIC_DATA.siteB.id,
        input.templateVersionId,
        JSON.stringify(input.content),
        next.rows[0].number,
        SYNTHETIC_DATA.userAdmin.id,
        stableUuid(`${publicationId}:publish`),
      ],
    );
  }
  await insertReferences(client, {
    tenantId: SYNTHETIC_DATA.tenantB.id,
    siteId: SYNTHETIC_DATA.siteB.id,
    content: input.content,
    publicationId,
  });
}

async function seedV2Content(
  client: PoolClient,
  draft: Awaited<ReturnType<typeof validatePreconditions>>["draft"],
): Promise<void> {
  const bundled = await client.query<{ reference: string; assetId: string }>(
    `SELECT bundled_reference AS reference,id AS "assetId"
     FROM public.media_assets
     WHERE site_id=$1 AND source_kind='bundled' AND status='ready'`,
    [SYNTHETIC_DATA.siteB.id],
  );
  let content: RestaurantContentV2;
  if (draft.schemaKey === "restaurant.v1") {
    content = migrateRestaurantV1ToV2(
      draft.content as RestaurantContent,
      Object.fromEntries(
        bundled.rows.map((row) => [row.reference, row.assetId]),
      ),
    );
    await client.query(
      `UPDATE public.site_template_assignments SET
         template_version_id=$2,schema_key='restaurant.v2',schema_version=2,
         idempotency_key=$3,version=version+1
       WHERE site_id=$1`,
      [
        SYNTHETIC_DATA.siteB.id,
        SYNTHETIC_DATA.templateRestaurantV2.id,
        stableUuid(`${SYNTHETIC_DATA.siteB.id}:v2-assignment`),
      ],
    );
    await client.query(
      `UPDATE public.site_content_drafts SET schema_key='restaurant.v2',
         schema_version=2,content=$2::jsonb,revision=revision+1,
         last_idempotency_key=$3 WHERE id=$1`,
      [draft.id, JSON.stringify(content), TARGET_DRAFT_KEY],
    );
  } else {
    content = validateRestaurantV2Content(draft.content, "draft");
  }

  await client.query(
    `DELETE FROM public.content_media_references
     WHERE draft_id=$1 AND owner_kind='draft'`,
    [draft.id],
  );
  await insertReferences(client, {
    tenantId: SYNTHETIC_DATA.tenantB.id,
    siteId: SYNTHETIC_DATA.siteB.id,
    content,
    draftId: draft.id,
  });
  for (const [index, templateVersionId] of [
    SYNTHETIC_DATA.templateRestaurantV2.id,
    SYNTHETIC_DATA.templateRestaurantModernV1.id,
  ].entries()) {
    await seedHistoricalPublication(client, {
      content,
      templateVersionId,
      index,
    });
  }
  await client.query(
    `UPDATE public.site_template_assignments SET
       template_version_id=$2,idempotency_key=$3,version=version+1
     WHERE site_id=$1 AND template_version_id IS DISTINCT FROM $2`,
    [
      SYNTHETIC_DATA.siteB.id,
      SYNTHETIC_DATA.templateRestaurantV2.id,
      stableUuid(`${SYNTHETIC_DATA.siteB.id}:seed-template:final`),
    ],
  );
}

async function recordSeedSuccess(client: PoolClient): Promise<void> {
  const correlationId = `media-seed-${SEED_VERSION}`;
  await client.query(
    `INSERT INTO public.platform_audit_events(
       actor_user_id,tenant_id,action,resource_type,resource_id,outcome,
       correlation_id,metadata
     )
     SELECT NULL,$1,'media_processing_completed','media_asset',$2,'succeeded',
       $3,$4::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM public.platform_audit_events WHERE correlation_id=$3
     )`,
    [
      SYNTHETIC_DATA.tenantB.id,
      `synthetic-seed:${SEED_VERSION}`,
      correlationId,
      JSON.stringify({ synthetic: true, seed_version: SEED_VERSION }),
    ],
  );
}

export async function seedSyntheticMedia(
  options: MediaSeedOptions = {},
): Promise<{ root: string }> {
  const environment = process.env.APP_ENV?.trim() || "local";
  if (!["local", "test"].includes(environment)) {
    throw new MediaSeedError("media_seed_forbidden");
  }
  if (options.failurePoint && environment !== "test") {
    throw new MediaSeedError("media_seed_test_failure_forbidden");
  }
  const connectionString = readDatabaseUrl("migration");
  assertSafeResetTarget(connectionString);
  const localStorage = options.storage ?? new LocalObjectStorage();
  await localStorage.initialize();
  const storage = new SeedTrackingStorage(localStorage);
  const pool = new pg.Pool({
    connectionString,
    application_name: "nexi-media-seed",
    max: 1,
  });
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const context = await validatePreconditions(client);
    await seedBundledAssets(
      client,
      storage,
      context.sites,
      options.failurePoint,
    );
    await seedOperationalStates(client);
    await seedV2Content(client, context.draft);
    await recordSeedSuccess(client);
    await client.query("COMMIT");
    committed = true;
    storage.commit();
    return { root: localStorage.root };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    await storage.rollback();
    throw error;
  } finally {
    if (!committed) await storage.rollback();
    client.release();
    await pool.end();
  }
}

async function runCli(): Promise<void> {
  try {
    const result = await seedSyntheticMedia();
    process.stdout.write(`Synthetic media seeded in ${result.root}\n`);
  } catch (error) {
    const code = error instanceof MediaSeedError
      ? error.code
      : "media_seed_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}

const directEntry = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (directEntry === import.meta.url) {
  await runCli();
}
