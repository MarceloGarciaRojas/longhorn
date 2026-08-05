import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { PoolClient } from "pg";

import {
  assertSafeResetTarget,
  readDatabaseUrl,
} from "../../src/db/config";
import { createDatabasePool } from "../../src/db/pool";
import {
  applyMigrations,
  getMigrationStatus,
  rollbackAllMigrations,
} from "./migrations";
import { seedSyntheticData } from "./seed";

const BOOTSTRAP_SQL = fileURLToPath(
  new URL("../../db/bootstrap/0001_local_roles.sql", import.meta.url),
);

async function withClient<T>(
  connectionString: string,
  applicationName: string,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = createDatabasePool({
    connectionString,
    applicationName,
    maxConnections: 1,
  });
  const client = await pool.connect();
  try {
    return await operation(client);
  } finally {
    client.release();
    await pool.end();
  }
}

async function bootstrap(): Promise<void> {
  const connectionString = readDatabaseUrl("admin");
  const sql = await readFile(BOOTSTRAP_SQL, "utf8");
  await withClient(connectionString, "nexi-bootstrap", async (client) => {
    await client.query(sql);
  });
  console.log("PostgreSQL local roles and privileges are ready.");
}

async function migrate(): Promise<void> {
  const executed = await applyMigrations(readDatabaseUrl("migration"));
  console.log(
    executed.length > 0
      ? `Applied migrations: ${executed.join(", ")}`
      : "No pending migrations.",
  );
}

async function status(): Promise<void> {
  const rows = await getMigrationStatus(readDatabaseUrl("migration"));
  for (const row of rows) {
    console.log(`${row.applied ? "[applied]" : "[pending]"} ${row.version} ${row.name}`);
  }
}

async function seed(): Promise<void> {
  await seedSyntheticData(readDatabaseUrl("migration"));
  console.log("Synthetic Tenant A and Tenant B data are ready.");
}

async function reset(): Promise<void> {
  const connectionString = readDatabaseUrl("migration");
  assertSafeResetTarget(connectionString);
  const rolledBack = await rollbackAllMigrations(connectionString);
  console.log(
    rolledBack.length > 0
      ? `Rolled back migrations: ${rolledBack.join(", ")}`
      : "No migrations required rollback.",
  );
  await applyMigrations(connectionString);
  await seedSyntheticData(connectionString);
  console.log("Local/test database reset completed.");
}

async function check(): Promise<void> {
  const connectionString = readDatabaseUrl("application");
  await withClient(connectionString, "nexi-db-check", async (client) => {
    const result = await client.query<{
      currentUser: string;
      databaseName: string;
      bypassRls: boolean;
      superuser: boolean;
    }>(
      `SELECT
         current_user AS "currentUser",
         current_database() AS "databaseName",
         role.rolbypassrls AS "bypassRls",
         role.rolsuper AS "superuser"
       FROM pg_catalog.pg_roles AS role
       WHERE role.rolname = current_user`,
    );
    const row = result.rows[0];
    if (!row || row.currentUser !== "nexi_app" || row.bypassRls || row.superuser) {
      throw new Error("Application database role is not restricted as expected");
    }
    console.log(
      `Database connection is healthy for restricted role ${row.currentUser}.`,
    );
  });
}

const command = process.argv[2];

try {
  switch (command) {
    case "bootstrap":
      await bootstrap();
      break;
    case "migrate":
      await migrate();
      break;
    case "status":
      await status();
      break;
    case "seed":
      await seed();
      break;
    case "reset":
      await reset();
      break;
    case "check":
      await check();
      break;
    default:
      throw new Error(
        "Expected one command: bootstrap, migrate, status, seed, reset or check",
      );
  }
} catch (error) {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "Unknown database error";
  console.error(`${name}: ${message}`);
  process.exitCode = 1;
}
