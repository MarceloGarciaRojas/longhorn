import assert from "node:assert/strict";
import test from "node:test";

import { ALPHA_DATABASE_PROVISIONING_SQL } from "../../src/alpha/db-bootstrap-config";
import { assertSafeResetTarget, readDatabaseUrl } from "../../src/db/config";
import { createDatabasePool } from "../../src/db/pool";

test("Alpha provisioning enforces the database privilege contract idempotently", async (t) => {
  const adminUrl = readDatabaseUrl("admin");
  const migrationUrl = readDatabaseUrl("migration");
  const applicationUrl = readDatabaseUrl("test");
  assertSafeResetTarget(adminUrl);
  assertSafeResetTarget(migrationUrl);
  assertSafeResetTarget(applicationUrl);
  const appPassword = decodeURIComponent(new URL(applicationUrl).password);
  const migratorPassword = decodeURIComponent(new URL(migrationUrl).password);
  assert.ok(appPassword);
  assert.ok(migratorPassword);

  const pool = createDatabasePool({
    connectionString: adminUrl,
    applicationName: "nexi-alpha-provisioning-test",
    maxConnections: 1,
  });
  t.after(async () => {
    await pool.end();
  });

  const client = await pool.connect();
  try {
    for (let run = 0; run < 2; run += 1) {
      await client.query("BEGIN");
      try {
        await client.query("SELECT set_config('nexi.app_password',$1,true)", [
          appPassword,
        ]);
        await client.query(
          "SELECT set_config('nexi.migrator_password',$1,true)",
          [migratorPassword],
        );
        await client.query(ALPHA_DATABASE_PROVISIONING_SQL);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    const roles = await client.query<{
      roleName: string;
      superuser: boolean;
      createDatabase: boolean;
      createRole: boolean;
      inherit: boolean;
      bypassRls: boolean;
      connectDatabase: boolean;
      createOnDatabase: boolean;
      temporaryDatabase: boolean;
    }>(
      `SELECT role.rolname AS "roleName",role.rolsuper AS superuser,
         role.rolcreatedb AS "createDatabase",role.rolcreaterole AS "createRole",
         role.rolinherit AS inherit,role.rolbypassrls AS "bypassRls",
         has_database_privilege(role.rolname,current_database(),'CONNECT')
           AS "connectDatabase",
         has_database_privilege(role.rolname,current_database(),'CREATE')
           AS "createOnDatabase",
         has_database_privilege(role.rolname,current_database(),'TEMPORARY')
           AS "temporaryDatabase"
       FROM pg_catalog.pg_roles AS role
       WHERE role.rolname IN ('nexi_migrator','nexi_app')
       ORDER BY role.rolname`,
    );

    assert.deepEqual(roles.rows, [
      {
        roleName: "nexi_app",
        superuser: false,
        createDatabase: false,
        createRole: false,
        inherit: false,
        bypassRls: false,
        connectDatabase: true,
        createOnDatabase: false,
        temporaryDatabase: true,
      },
      {
        roleName: "nexi_migrator",
        superuser: false,
        createDatabase: false,
        createRole: false,
        inherit: false,
        bypassRls: false,
        connectDatabase: true,
        createOnDatabase: true,
        temporaryDatabase: true,
      },
    ]);
  } finally {
    client.release();
  }
});
