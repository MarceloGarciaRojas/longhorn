import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { PoolClient } from "pg";

import { createDatabasePool } from "../../src/db/pool";

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../db/migrations/", import.meta.url),
);
const MIGRATION_LOCK_ID = 7_341_904_112;

interface MigrationFile {
  version: string;
  name: string;
  upSql: string;
  downSql: string;
  checksum: string;
}

export interface MigrationStatus {
  version: string;
  name: string;
  applied: boolean;
}

async function readMigrations(): Promise<MigrationFile[]> {
  const names = (await readdir(MIGRATIONS_DIRECTORY))
    .filter((name) => /^\d{4}_.+\.up\.sql$/.test(name))
    .sort();

  return Promise.all(
    names.map(async (upName) => {
      const match = /^(\d{4})_(.+)\.up\.sql$/.exec(upName);
      if (!match) {
        throw new Error(`Invalid migration name: ${upName}`);
      }
      const [, version, name] = match;
      const downName = `${version}_${name}.down.sql`;
      const [upSql, downSql] = await Promise.all([
        readFile(`${MIGRATIONS_DIRECTORY}/${upName}`, "utf8"),
        readFile(`${MIGRATIONS_DIRECTORY}/${downName}`, "utf8"),
      ]);
      return {
        version,
        name,
        upSql,
        downSql,
        checksum: createHash("sha256").update(upSql).digest("hex"),
      };
    }),
  );
}

async function ensureMigrationMetadata(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS nexi_internal AUTHORIZATION nexi_migrator;
    REVOKE ALL ON SCHEMA nexi_internal FROM PUBLIC;
    CREATE TABLE IF NOT EXISTS nexi_internal.schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
    );
    REVOKE ALL ON TABLE nexi_internal.schema_migrations FROM PUBLIC, nexi_app;
  `);
}

async function withMigrationClient<T>(
  connectionString: string,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = createDatabasePool({
    connectionString,
    applicationName: "nexi-migrations",
    maxConnections: 1,
  });
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await ensureMigrationMetadata(client);
    return await operation(client);
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID])
      .catch(() => undefined);
    client.release();
    await pool.end();
  }
}

export async function applyMigrations(
  connectionString: string,
): Promise<string[]> {
  const migrations = await readMigrations();

  return withMigrationClient(connectionString, async (client) => {
    const appliedRows = await client.query<{
      version: string;
      checksum: string;
    }>(
      "SELECT version, checksum FROM nexi_internal.schema_migrations ORDER BY version",
    );
    const applied = new Map(
      appliedRows.rows.map((row) => [row.version, row.checksum]),
    );
    const executed: string[] = [];

    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.version);
      if (existingChecksum) {
        if (existingChecksum !== migration.checksum) {
          throw new Error(
            `Migration ${migration.version} changed after it was applied`,
          );
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(migration.upSql);
        await client.query(
          `INSERT INTO nexi_internal.schema_migrations
             (version, name, checksum)
           VALUES ($1, $2, $3)`,
          [migration.version, migration.name, migration.checksum],
        );
        await client.query("COMMIT");
        executed.push(migration.version);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    return executed;
  });
}

export async function getMigrationStatus(
  connectionString: string,
): Promise<MigrationStatus[]> {
  const migrations = await readMigrations();
  return withMigrationClient(connectionString, async (client) => {
    const result = await client.query<{ version: string }>(
      "SELECT version FROM nexi_internal.schema_migrations",
    );
    const applied = new Set(result.rows.map((row) => row.version));
    return migrations.map((migration) => ({
      version: migration.version,
      name: migration.name,
      applied: applied.has(migration.version),
    }));
  });
}

export async function rollbackAllMigrations(
  connectionString: string,
): Promise<string[]> {
  const migrations = (await readMigrations()).reverse();

  return withMigrationClient(connectionString, async (client) => {
    const appliedRows = await client.query<{ version: string }>(
      "SELECT version FROM nexi_internal.schema_migrations",
    );
    const applied = new Set(appliedRows.rows.map((row) => row.version));
    const rolledBack: string[] = [];

    for (const migration of migrations) {
      if (!applied.has(migration.version)) {
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(migration.downSql);
        await client.query(
          "DELETE FROM nexi_internal.schema_migrations WHERE version = $1",
          [migration.version],
        );
        await client.query("COMMIT");
        rolledBack.push(migration.version);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    return rolledBack;
  });
}
