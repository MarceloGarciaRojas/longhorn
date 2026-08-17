import { readFile } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";

import { loadAlphaConfig } from "../../src/alpha/config";
import { validateAlphaSmokeEvidence } from "../../src/alpha/smoke-evidence";
import { createDatabasePool } from "../../src/db/pool";

const config = loadAlphaConfig();
const commitSha = process.env.APP_COMMIT_SHA?.trim() || "";
if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
  throw new Error("APP_COMMIT_SHA must be the exact deployed 40-character SHA");
}
const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
if (!cloudflareToken) throw new Error("CLOUDFLARE_API_TOKEN is required for Alpha smoke");

const hyperdriveResponse = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/hyperdrive/configs/${config.hyperdriveId}`,
  {
    headers: {
      authorization: `Bearer ${cloudflareToken}`,
      "user-agent": "nexi-alpha-smoke/1",
    },
    signal: AbortSignal.timeout(10_000),
  },
);
if (!hyperdriveResponse.ok) {
  throw new Error(`Hyperdrive configuration returned HTTP ${hyperdriveResponse.status}`);
}
const hyperdrive = (await hyperdriveResponse.json()) as {
  success?: boolean;
  result?: { caching?: { disabled?: boolean } };
};
if (hyperdrive.success !== true || hyperdrive.result?.caching?.disabled !== true) {
  throw new Error("Hyperdrive query caching must be disabled for Alpha");
}

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
  health.commit !== commitSha
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

const evidenceFile = process.env.ALPHA_SMOKE_EVIDENCE_FILE?.trim();
if (!evidenceFile || !isAbsolute(evidenceFile)) {
  throw new Error("ALPHA_SMOKE_EVIDENCE_FILE must be an absolute path outside the repository");
}
const repositoryRelative = relative(process.cwd(), evidenceFile);
if (
  repositoryRelative === "" ||
  (!repositoryRelative.startsWith(`..${sep}`) &&
    repositoryRelative !== ".." &&
    !isAbsolute(repositoryRelative))
) {
  throw new Error("ALPHA_SMOKE_EVIDENCE_FILE must remain outside the repository");
}
const evidence = JSON.parse(await readFile(evidenceFile, "utf8")) as unknown;
validateAlphaSmokeEvidence(evidence, commitSha);

console.log("Alpha smoke approved: uncached Hyperdrive, exact artifact, Auth, role and RLS.");
console.log("Restaurant E2E approved: read-after-write, revocations and Workers Free CPU.");
console.log("Storage write/read/delete verification remains a provisioning gate.");
