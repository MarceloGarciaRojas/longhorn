import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import pg from "pg";

import { readDatabaseUrl } from "../../src/db/config";
import {
  applyMigrations,
  rollbackAllMigrations,
} from "../../scripts/db/migrations";
import {
  seedSyntheticData,
  SYNTHETIC_DATA,
} from "../../scripts/db/seed";
import { LocalObjectStorage } from "../../scripts/media/local-storage";
import {
  MediaSeedError,
  seedSyntheticMedia,
} from "../../scripts/media/seed";

const migrationUrl = readDatabaseUrl("migration");

interface SeedSnapshot {
  status: string;
  templateVersionId: string;
  assignmentSchema: string;
  assignmentVersion: number;
  assignmentRecordVersion: number;
  draftSchema: string;
  draftVersion: number;
  revision: number;
  contentHash: string;
  assets: number;
  variants: number;
  references: number;
  publications: number;
  successfulAudits: number;
}

async function resetCanonical(): Promise<void> {
  await rollbackAllMigrations(migrationUrl);
  await applyMigrations(migrationUrl);
  await seedSyntheticData(migrationUrl);
}

async function withPool<T>(
  operation: (pool: pg.Pool) => Promise<T>,
): Promise<T> {
  const pool = new pg.Pool({ connectionString: migrationUrl, max: 1 });
  try {
    return await operation(pool);
  } finally {
    await pool.end();
  }
}

async function snapshot(): Promise<SeedSnapshot> {
  return withPool(async (pool) => {
    const result = await pool.query<SeedSnapshot>(
      `SELECT site.status,
         assignment.template_version_id AS "templateVersionId",
         assignment.schema_key AS "assignmentSchema",
         assignment.schema_version AS "assignmentVersion",
         assignment.version AS "assignmentRecordVersion",
         draft.schema_key AS "draftSchema",
         draft.schema_version AS "draftVersion",draft.revision,
         md5(draft.content::text) AS "contentHash",
         (SELECT count(*)::int FROM public.media_assets asset
          WHERE asset.site_id=site.id) AS assets,
         (SELECT count(*)::int FROM public.media_variants variant
          JOIN public.media_assets asset ON asset.id=variant.asset_id
          WHERE asset.site_id=site.id) AS variants,
         (SELECT count(*)::int FROM public.content_media_references reference
          WHERE reference.site_id=site.id) AS references,
         (SELECT count(*)::int FROM public.site_content_publications publication
          WHERE publication.site_id=site.id) AS publications,
         (SELECT count(*)::int FROM public.platform_audit_events event
          WHERE event.correlation_id='media-seed-8b.1'
            AND event.outcome='succeeded') AS "successfulAudits"
       FROM public.sites site
       JOIN public.site_template_assignments assignment
         ON assignment.site_id=site.id
       JOIN public.site_content_drafts draft ON draft.site_id=site.id
       WHERE site.id=$1`,
      [SYNTHETIC_DATA.siteB.id],
    );
    assert.ok(result.rows[0]);
    return result.rows[0];
  });
}

async function testStorage(): Promise<LocalObjectStorage> {
  const root = await mkdtemp(join(tmpdir(), "nexi-media-seed-test-"));
  return new LocalObjectStorage(root);
}

async function webpCount(storage: LocalObjectStorage): Promise<number> {
  const entries = await readdir(storage.root, { recursive: true }).catch(() => []);
  return entries.filter((entry) => entry.endsWith(".webp")).length;
}

test("media seed is isolated, transactional and idempotent", async (t) => {
  process.env.APP_ENV = "test";

  await t.test("canonical template seed registers exactly three v2 options idempotently", async () => {
    await resetCanonical();
    const catalog = async () => withPool(async (pool) => {
      const result = await pool.query<{
        id: string;
        key: string;
        rendererKey: string;
      }>(
        `SELECT version.id,template.key,
           version.renderer_key AS "rendererKey"
         FROM public.template_versions version
         JOIN public.templates template ON template.id=version.template_id
         WHERE version.content_schema_key='restaurant.v2'
           AND version.minimum_schema_version<=2
           AND version.maximum_schema_version>=2
         ORDER BY CASE template.key
           WHEN 'restaurant-classic' THEN 1
           WHEN 'restaurant-modern' THEN 2
           WHEN 'restaurant-editorial' THEN 3
           ELSE 99 END`,
      );
      return result.rows;
    });
    const first = await catalog();
    await seedSyntheticData(migrationUrl);
    const second = await catalog();
    assert.deepEqual(second, first);
    assert.deepEqual(
      first.map(({ key, rendererKey }) => ({ key, rendererKey })),
      [
        { key: "restaurant-classic", rendererKey: "restaurant-classic-v2" },
        { key: "restaurant-modern", rendererKey: "restaurant-modern-v1" },
        { key: "restaurant-editorial", rendererKey: "restaurant-editorial-v1" },
      ],
    );
    assert.equal(
      first[2]?.id,
      SYNTHETIC_DATA.templateRestaurantEditorialV1.id,
    );
  });

  await t.test("archived target fails before any partial change", async () => {
    await resetCanonical();
    await withPool((pool) =>
      pool.query(
        `UPDATE public.sites SET status='archived' WHERE id=$1`,
        [SYNTHETIC_DATA.siteB.id],
      ).then(() => undefined),
    );
    const before = await snapshot();
    const storage = await testStorage();
    try {
      await assert.rejects(
        seedSyntheticMedia({ storage }),
        (error: unknown) =>
          error instanceof MediaSeedError &&
          error.code === "media_seed_site_not_editable_reset_required",
      );
      assert.deepEqual(await snapshot(), before);
      assert.equal(await webpCount(storage), 0);
    } finally {
      await storage.cleanTestRoot();
    }
  });

  await t.test("synthetic mid-seed failure rolls back database and objects", async () => {
    await resetCanonical();
    const before = await snapshot();
    const storage = await testStorage();
    try {
      await assert.rejects(
        seedSyntheticMedia({ storage, failurePoint: "after_first_asset" }),
        (error: unknown) =>
          error instanceof MediaSeedError &&
          error.code === "media_seed_synthetic_failure",
      );
      assert.deepEqual(await snapshot(), before);
      assert.equal(await webpCount(storage), 0);
    } finally {
      await storage.cleanTestRoot();
    }
  });

  await t.test("two successful executions preserve logical state and counts", async () => {
    await resetCanonical();
    const storage = await testStorage();
    try {
      await seedSyntheticMedia({ storage });
      const first = await snapshot();
      const firstObjectCount = await webpCount(storage);
      await seedSyntheticMedia({ storage });
      assert.deepEqual(await snapshot(), first);
      assert.equal(await webpCount(storage), firstObjectCount);
      assert.equal(first.assets, 4);
      assert.equal(first.variants, 12);
      assert.ok(first.references > 0);
      assert.equal(first.successfulAudits, 1);
    } finally {
      await storage.cleanTestRoot();
    }
  });
});
