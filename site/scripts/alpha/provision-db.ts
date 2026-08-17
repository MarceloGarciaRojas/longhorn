import {
  ALPHA_DATABASE_PROVISIONED_MESSAGE,
  loadAlphaDatabaseBootstrapConfig,
} from "../../src/alpha/db-bootstrap-config";
import { createDatabasePool } from "../../src/db/pool";

const config = loadAlphaDatabaseBootstrapConfig();
const pool = createDatabasePool({
  connectionString: config.databaseAdminUrl,
  applicationName: "nexi-alpha-provision",
  maxConnections: 1,
});
const client = await pool.connect();

try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('nexi.app_password',$1,true)", [
    config.applicationPassword,
  ]);
  await client.query("SELECT set_config('nexi.migrator_password',$1,true)", [
    config.migratorPassword,
  ]);
  await client.query(`
    DO $provision$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='nexi_migrator'
      ) THEN
        CREATE ROLE nexi_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
          NOINHERIT NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='nexi_app'
      ) THEN
        CREATE ROLE nexi_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
          NOINHERIT NOBYPASSRLS;
      END IF;
      EXECUTE format(
        'ALTER ROLE nexi_migrator PASSWORD %L',
        current_setting('nexi.migrator_password')
      );
      EXECUTE format(
        'ALTER ROLE nexi_app PASSWORD %L',
        current_setting('nexi.app_password')
      );
      EXECUTE format(
        'GRANT CONNECT, TEMPORARY ON DATABASE %I TO nexi_migrator',
        current_database()
      );
      EXECUTE format(
        'GRANT CONNECT ON DATABASE %I TO nexi_app',
        current_database()
      );
    END
    $provision$;

    ALTER ROLE nexi_migrator SET statement_timeout='30s';
    ALTER ROLE nexi_app SET statement_timeout='5s';
    ALTER ROLE nexi_app SET idle_in_transaction_session_timeout='10s';
    ALTER ROLE nexi_app SET row_security='on';
    REVOKE ALL ON SCHEMA public FROM PUBLIC;
    GRANT USAGE, CREATE ON SCHEMA public TO nexi_migrator;
    GRANT USAGE ON SCHEMA public TO nexi_app;
  `);
  await client.query("COMMIT");
  console.log(ALPHA_DATABASE_PROVISIONED_MESSAGE);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
