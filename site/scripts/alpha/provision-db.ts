import {
  ALPHA_DATABASE_PROVISIONED_MESSAGE,
  ALPHA_DATABASE_PROVISIONING_SQL,
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
  await client.query(ALPHA_DATABASE_PROVISIONING_SQL);
  await client.query("COMMIT");
  console.log(ALPHA_DATABASE_PROVISIONED_MESSAGE);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
