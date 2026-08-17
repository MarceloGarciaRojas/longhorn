import { loadAlphaConfig } from "../../src/alpha/config";
import { createDatabasePool } from "../../src/db/pool";

const config = loadAlphaConfig();
const response = await fetch(new URL("/api/health", `${config.publicUrl}/`), {
  headers: { "user-agent": "nexi-alpha-smoke/1" },
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) throw new Error(`Alpha health returned HTTP ${response.status}`);
const health = (await response.json()) as {
  status?: string;
  application?: string;
  environment?: string;
  commit?: string;
};
if (
  health.status !== "ok" ||
  health.application !== "nexi" ||
  health.environment !== "alpha" ||
  health.commit !== process.env.APP_COMMIT_SHA?.trim()
) {
  throw new Error("Alpha health metadata does not match the approved artifact");
}

const pool = createDatabasePool({
  connectionString: config.databaseApplicationUrl,
  applicationName: "nexi-alpha-smoke",
  maxConnections: 1,
});
try {
  const role = await pool.query<{
    currentUser: string;
    bypassRls: boolean;
    superuser: boolean;
    rowSecurity: string;
  }>(`
    SELECT current_user AS "currentUser",role.rolbypassrls AS "bypassRls",
      role.rolsuper AS superuser,current_setting('row_security') AS "rowSecurity"
    FROM pg_catalog.pg_roles role WHERE role.rolname=current_user
  `);
  const row = role.rows[0];
  if (
    !row ||
    row.currentUser !== "nexi_app" ||
    row.bypassRls ||
    row.superuser ||
    row.rowSecurity !== "on"
  ) {
    throw new Error("Alpha application role is not restricted as required");
  }
  const unsafe = await pool.query<{ count: number }>(`
    SELECT count(*)::integer AS count
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
    JOIN pg_catalog.pg_attribute tenant_column
      ON tenant_column.attrelid=relation.oid
     AND tenant_column.attname='tenant_id'
     AND NOT tenant_column.attisdropped
    WHERE namespace.nspname='public' AND relation.relkind='r'
      AND NOT relation.relrowsecurity
  `);
  if (unsafe.rows[0]?.count !== 0) {
    throw new Error("Alpha contains tenant tables without RLS");
  }
} finally {
  await pool.end();
}

const authResponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/health`, {
  headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY || "" },
  signal: AbortSignal.timeout(8_000),
});
if (!authResponse.ok) {
  throw new Error(`Supabase Auth health returned HTTP ${authResponse.status}`);
}
console.log("Alpha smoke approved: URL, exact artifact, Auth, role and RLS.");
console.log("Storage write/read/delete verification remains a provisioning gate.");
