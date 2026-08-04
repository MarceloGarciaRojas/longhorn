import { assertSafeResetTarget, readDatabaseUrl } from "../../src/db/config";
import { createDatabasePool } from "../../src/db/pool";
import {
  ONBOARDING_SEED_PREFIX,
  seedOnboardingScenarios,
} from "./seed";

async function status(): Promise<void> {
  const connectionString = readDatabaseUrl("migration");
  assertSafeResetTarget(connectionString);
  const pool = createDatabasePool({
    connectionString,
    applicationName: "nexi-onboarding-status",
    maxConnections: 1,
  });
  try {
    const result = await pool.query<{ status: string; count: number }>(
      `SELECT status,count(*)::int AS count
       FROM public.onboarding_cases
       WHERE id IN (
         SELECT id FROM public.onboarding_cases
         WHERE public_reference LIKE $1
            OR site_id IN (
              SELECT id FROM public.sites WHERE slug LIKE $1
            )
       )
       GROUP BY status ORDER BY status`,
      [`${ONBOARDING_SEED_PREFIX}%`],
    );
    const intake = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM public.onboarding_intake_requests
       WHERE contact_email_normalized LIKE '%@example.invalid'
         AND (
           business_name LIKE 'Solicitud Seed %'
           OR business_name LIKE 'Restaurante Seed %'
         )`,
    );
    console.log(`Synthetic intake requests: ${intake.rows[0].count}`);
    for (const row of result.rows) {
      console.log(`${row.status}: ${row.count}`);
    }
  } finally {
    await pool.end();
  }
}

async function resetTest(): Promise<void> {
  const connectionString = readDatabaseUrl("migration");
  assertSafeResetTarget(connectionString);
  const pool = createDatabasePool({
    connectionString,
    applicationName: "nexi-onboarding-reset-test",
    maxConnections: 1,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sites = await client.query<{ id: string }>(
      "SELECT id FROM public.sites WHERE slug LIKE $1 FOR UPDATE",
      [`${ONBOARDING_SEED_PREFIX}%`],
    );
    const siteIds = sites.rows.map((row) => row.id);
    const cases = await client.query<{ id: string }>(
      "SELECT id FROM public.onboarding_cases WHERE site_id=ANY($1::uuid[])",
      [siteIds],
    );
    const caseIds = cases.rows.map((row) => row.id);
    const intakes = await client.query<{ id: string }>(
      `SELECT id FROM public.onboarding_intake_requests
       WHERE business_name LIKE 'Solicitud Seed %'
          OR business_name LIKE 'Restaurante Seed %'`,
    );
    const intakeIds = intakes.rows.map((row) => row.id);
    await client.query(
      `DELETE FROM public.platform_audit_events
       WHERE resource_id=ANY($1::text[])
          OR resource_id=ANY($2::text[])
          OR resource_id=ANY($3::text[])`,
      [siteIds,caseIds,intakeIds],
    );
    await client.query(
      "DELETE FROM public.onboarding_state_history WHERE onboarding_case_id=ANY($1::uuid[])",
      [caseIds],
    );
    await client.query(
      "DELETE FROM public.onboarding_internal_notes WHERE onboarding_case_id=ANY($1::uuid[])",
      [caseIds],
    );
    await client.query(
      "DELETE FROM public.onboarding_client_approvals WHERE onboarding_case_id=ANY($1::uuid[])",
      [caseIds],
    );
    await client.query(
      "DELETE FROM public.onboarding_checklist_items WHERE onboarding_case_id=ANY($1::uuid[])",
      [caseIds],
    );
    await client.query(
      "DELETE FROM public.onboarding_answers WHERE onboarding_case_id=ANY($1::uuid[])",
      [caseIds],
    );
    await client.query(
      `UPDATE public.onboarding_intake_requests SET
         converted_case_id=NULL,converted_site_id=NULL,converted_tenant_id=NULL
       WHERE id=ANY($1::uuid[])`,
      [intakeIds],
    );
    await client.query(
      "DELETE FROM public.onboarding_cases WHERE id=ANY($1::uuid[])",
      [caseIds],
    );
    await client.query(
      "DELETE FROM public.support_messages WHERE conversation_id IN (SELECT id FROM public.support_conversations WHERE site_id=ANY($1::uuid[]))",
      [siteIds],
    );
    await client.query(
      "DELETE FROM public.support_conversation_participants WHERE conversation_id IN (SELECT id FROM public.support_conversations WHERE site_id=ANY($1::uuid[]))",
      [siteIds],
    );
    await client.query(
      "DELETE FROM public.support_conversations WHERE site_id=ANY($1::uuid[])",
      [siteIds],
    );
    await client.query(
      "UPDATE public.sites SET current_publication_id=NULL WHERE id=ANY($1::uuid[])",
      [siteIds],
    );
    await client.query(
      "DELETE FROM public.content_media_references WHERE site_id=ANY($1::uuid[])",
      [siteIds],
    );
    await client.query(
      "ALTER TABLE public.site_content_publications DISABLE TRIGGER site_content_publications_immutable",
    );
    await client.query(
      "DELETE FROM public.site_content_publications WHERE site_id=ANY($1::uuid[])",
      [siteIds],
    );
    await client.query(
      "ALTER TABLE public.site_content_publications ENABLE TRIGGER site_content_publications_immutable",
    );
    await client.query(
      "DELETE FROM public.site_content_drafts WHERE site_id=ANY($1::uuid[])",
      [siteIds],
    );
    await client.query(
      "DELETE FROM public.site_template_assignment_history WHERE site_id=ANY($1::uuid[])",
      [siteIds],
    );
    await client.query(
      "DELETE FROM public.site_template_assignments WHERE site_id=ANY($1::uuid[])",
      [siteIds],
    );
    await client.query(
      "DELETE FROM public.site_domains WHERE site_id=ANY($1::uuid[])",
      [siteIds],
    );
    await client.query("DELETE FROM public.sites WHERE id=ANY($1::uuid[])", [siteIds]);
    await client.query(
      "DELETE FROM public.onboarding_intake_internal_notes WHERE intake_request_id=ANY($1::uuid[])",
      [intakeIds],
    );
    await client.query(
      "DELETE FROM public.onboarding_intake_requests WHERE id=ANY($1::uuid[])",
      [intakeIds],
    );
    await client.query("COMMIT");
    console.log(`Removed ${caseIds.length} synthetic onboarding cases only.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

switch (process.argv[2]) {
  case "seed":
    await seedOnboardingScenarios();
    console.log("Synthetic onboarding scenarios are ready.");
    break;
  case "status":
    await status();
    break;
  case "reset-test":
    await resetTest();
    break;
  default:
    throw new Error("Expected one command: seed, status or reset-test");
}
