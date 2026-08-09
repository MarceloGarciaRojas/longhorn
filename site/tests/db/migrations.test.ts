import assert from "node:assert/strict";
import test from "node:test";

import { readDatabaseUrl } from "../../src/db/config";
import { createDatabasePool } from "../../src/db/pool";
import {
  applyMigrations,
  getMigrationStatus,
  rollbackAllMigrations,
  rollbackLatestMigration,
} from "../../scripts/db/migrations";
import { seedSyntheticData, SYNTHETIC_DATA } from "../../scripts/db/seed";

interface PostgreSqlError extends Error {
  code?: string;
}

async function expectPgCode(
  operation: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    return (error as PostgreSqlError).code === expectedCode;
  });
}

test("versioned migrations create only the approved domain schema", async (t) => {
  const migrationUrl = readDatabaseUrl("migration");

  await rollbackAllMigrations(migrationUrl);
  const firstRun = await applyMigrations(migrationUrl);
  assert.deepEqual(firstRun, [
    "0001",
    "0002",
    "0003",
    "0004",
    "0005",
    "0006",
    "0007",
    "0008",
    "0009",
    "0010",
    "0011",
    "0012",
    "0013",
  ]);

  const secondRun = await applyMigrations(migrationUrl);
  assert.deepEqual(secondRun, []);
  await seedSyntheticData(migrationUrl);

  const pool = createDatabasePool({
    connectionString: migrationUrl,
    applicationName: "nexi-migration-tests",
    maxConnections: 1,
  });
  t.after(async () => {
    await pool.end();
  });

  const restaurantStateBeforeRollback = await pool.query<{
    templateKey: string;
    rendererKey: string;
    schemaKey: string;
  }>(
    `SELECT template.key AS "templateKey",version.renderer_key AS "rendererKey",
       version.content_schema_key AS "schemaKey"
     FROM public.templates template
     JOIN public.template_versions version ON version.template_id=template.id
     WHERE template.industry_key='restaurant' AND template.status='active'
       AND version.status='active'
     ORDER BY template.key,version.version`,
  );
  assert.equal(await rollbackLatestMigration(migrationUrl), "0013");
  assert.deepEqual(await applyMigrations(migrationUrl), ["0013"]);
  const restaurantStateAfterSecondUp = await pool.query<{
    templateKey: string;
    rendererKey: string;
    schemaKey: string;
  }>(
    `SELECT template.key AS "templateKey",version.renderer_key AS "rendererKey",
       version.content_schema_key AS "schemaKey"
     FROM public.templates template
     JOIN public.template_versions version ON version.template_id=template.id
     WHERE template.industry_key='restaurant' AND template.status='active'
       AND version.status='active'
     ORDER BY template.key,version.version`,
  );
  assert.deepEqual(
    restaurantStateAfterSecondUp.rows,
    restaurantStateBeforeRollback.rows,
  );

  const status = await getMigrationStatus(migrationUrl);
  assert.deepEqual(
    status.map((row) => [row.version, row.applied]),
    [
      ["0001", true],
      ["0002", true],
      ["0003", true],
      ["0004", true],
      ["0005", true],
      ["0006", true],
      ["0007", true],
      ["0008", true],
      ["0009", true],
      ["0010", true],
      ["0011", true],
      ["0012", true],
      ["0013", true],
    ],
  );

  const tables = await pool.query<{ tableName: string }>(
    `SELECT tablename AS "tableName"
     FROM pg_catalog.pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename`,
  );
  assert.deepEqual(
    tables.rows.map((row) => row.tableName),
    [
      "auth_audit_events",
      "auth_identities",
      "auth_rate_limits",
      "auth_recovery_grants",
      "auth_sessions",
      "content_media_references",
      "media_assets",
      "media_variants",
      "notification_outbox",
      "onboarding_answers",
      "onboarding_cases",
      "onboarding_checklist_items",
      "onboarding_client_approvals",
    "onboarding_intake_internal_notes",
    "onboarding_intake_requests",
      "onboarding_internal_notes",
      "onboarding_state_history",
      "plan_features",
      "plan_media_capabilities",
      "plans",
      "platform_audit_events",
      "platform_idempotency_keys",
      "platform_staff",
      "site_content_drafts",
      "site_content_publications",
      "site_deletion_requests",
      "site_domain_requests",
      "site_domains",
      "site_template_assignment_history",
      "site_template_assignments",
      "sites",
      "support_conversation_participants",
      "support_conversations",
      "support_messages",
      "template_versions",
      "templates",
      "tenant_invitations",
      "tenant_memberships",
      "tenant_plan_assignments",
      "tenant_profiles",
      "tenants",
      "user_profiles",
      "users",
    ],
  );

  const rls = await pool.query<{
    tableName: string;
    enabled: boolean;
  }>(
    `SELECT
       relname AS "tableName",
       relrowsecurity AS enabled
     FROM pg_catalog.pg_class
     WHERE relnamespace = 'public'::regnamespace
       AND relname IN (
         'tenants', 'users', 'tenant_memberships',
         'tenant_invitations', 'platform_audit_events',
         'platform_idempotency_keys', 'user_profiles', 'tenant_profiles',
         'sites', 'plans', 'plan_features', 'tenant_plan_assignments',
         'site_deletion_requests', 'site_domain_requests', 'site_domains',
         'support_conversations', 'support_messages',
         'support_conversation_participants', 'notification_outbox',
         'templates', 'template_versions', 'site_template_assignments',
         'site_content_drafts', 'site_content_publications',
         'plan_media_capabilities','media_assets','media_variants',
         'content_media_references','site_template_assignment_history',
         'onboarding_intake_requests','onboarding_cases',
         'onboarding_answers','onboarding_checklist_items',
         'onboarding_client_approvals','onboarding_state_history',
         'onboarding_internal_notes','onboarding_intake_internal_notes'
       )
     ORDER BY relname`,
  );
  assert.equal(rls.rowCount, 37);
  assert.ok(rls.rows.every((row) => row.enabled));

  const policies = await pool.query<{ policyName: string }>(
    `SELECT policyname AS "policyName"
     FROM pg_catalog.pg_policies
     WHERE schemaname = 'public'
     ORDER BY policyname`,
  );
  assert.deepEqual(
    policies.rows.map((row) => row.policyName),
    [
      "audit_operations_admin_select",
      "content_drafts_admin_all",
      "content_drafts_client_insert",
      "content_drafts_client_select",
      "content_drafts_client_update",
      "content_media_admin_all",
      "content_media_client_delete",
      "content_media_client_insert",
      "content_media_client_select",
      "content_media_client_update",
      "content_publications_admin_all",
      "content_publications_client_insert",
      "content_publications_client_select",
      "conversations_admin_all",
      "conversations_client_all",
      "deletion_admin_all",
      "deletion_client_cancel",
      "deletion_client_insert",
      "deletion_client_select",
      "domain_request_admin_all",
      "domain_request_client_insert",
      "domain_request_client_select",
      "domains_admin_all",
      "domains_client_select",
      "media_assets_admin_all",
      "media_assets_client_insert",
      "media_assets_client_select",
      "media_assets_client_update",
      "media_variants_admin_all",
      "media_variants_client_insert",
      "media_variants_client_select",
      "memberships_delete_self",
      "memberships_insert_self",
      "memberships_onboarding_admin_select",
      "memberships_select_current",
      "memberships_update_self",
      "messages_admin_all",
      "messages_client_insert",
      "messages_client_select",
      "onboarding_answers_admin_all",
      "onboarding_answers_client_all",
      "onboarding_approvals_admin_all",
      "onboarding_approvals_client_select",
      "onboarding_approvals_client_update",
      "onboarding_cases_admin_all",
      "onboarding_cases_client_select",
      "onboarding_cases_client_update",
      "onboarding_checklist_admin_all",
      "onboarding_checklist_client_select",
      "onboarding_checklist_client_update",
      "onboarding_history_admin_select",
      "onboarding_intake_admin_all",
      "onboarding_intake_notes_admin_all",
      "onboarding_notes_admin_all",
      "outbox_admin_all",
      "participants_admin_all",
      "participants_client_all",
      "plan_features_select_assigned",
      "plan_media_admin_all",
      "plan_media_client_select",
      "plans_onboarding_admin_select",
      "plans_select_assigned",
      "sites_admin_all",
      "sites_client_deletion_update",
      "sites_select_current",
      "template_assignments_admin_all",
      "template_assignments_client_select",
      "template_assignments_client_update",
      "template_history_admin_select",
      "template_history_client_select",
      "template_versions_admin_all",
      "template_versions_client_assigned_select",
      "template_versions_client_catalog_select",
      "templates_admin_all",
      "templates_client_assigned_select",
      "templates_client_catalog_select",
      "tenant_plan_assignments_onboarding_admin_all",
      "tenant_plan_assignments_select_current",
      "tenant_profiles_insert_current",
      "tenant_profiles_onboarding_admin_all",
      "tenant_profiles_select_current",
      "tenant_profiles_update_current",
      "tenants_operations_admin_select",
      "tenants_select_current",
      "tenants_update_current_profile",
      "user_profiles_insert_self",
      "user_profiles_select_self",
      "user_profiles_update_self",
      "users_operations_admin_select",
      "users_select_current_tenant",
      "users_update_self",
    ],
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query("SAVEPOINT invalid_tenant_status");
    await expectPgCode(
      () =>
        client.query(
          `INSERT INTO public.tenants
             (id, slug, display_name, status)
           VALUES ($1, 'estado-invalido', 'Empresa Ficticia', 'unknown')`,
          ["33333333-3333-4333-8333-333333333333"],
        ),
      "23514",
    );
    await client.query("ROLLBACK TO SAVEPOINT invalid_tenant_status");

    await client.query("SAVEPOINT duplicate_slug");
    await expectPgCode(
      () =>
        client.query(
          `INSERT INTO public.tenants
             (id, slug, display_name, status)
           VALUES ($1, $2, 'Duplicado Ficticio', 'active')`,
          [
            "44444444-4444-4444-8444-444444444444",
            SYNTHETIC_DATA.tenantA.slug,
          ],
        ),
      "23505",
    );
    await client.query("ROLLBACK TO SAVEPOINT duplicate_slug");

    await client.query("SAVEPOINT duplicate_membership");
    await expectPgCode(
      () =>
        client.query(
          `INSERT INTO public.tenant_memberships
             (id, tenant_id, user_id, status)
           VALUES ($1, $2, $3, 'active')`,
          [
            "a5555555-5555-4555-8555-555555555555",
            SYNTHETIC_DATA.tenantA.id,
            SYNTHETIC_DATA.userA.id,
          ],
        ),
      "23505",
    );
    await client.query("ROLLBACK TO SAVEPOINT duplicate_membership");

    const industryConstraints = await client.query<{
      tableName: string;
      constraintName: string;
      definition: string;
    }>(
      `SELECT conrelid::regclass::text AS "tableName",conname AS "constraintName",
         pg_get_constraintdef(oid) AS definition
       FROM pg_catalog.pg_constraint
       WHERE conname IN (
         'sites_industry_valid','templates_industry_valid',
         'site_content_draft_schema_valid','site_content_publication_schema_valid'
       )
       ORDER BY conname`,
    );
    const byName = new Map(
      industryConstraints.rows.map((row) => [row.constraintName, row.definition]),
    );
    assert.match(byName.get("sites_industry_valid") ?? "", /restaurant.*gym/);
    assert.match(byName.get("templates_industry_valid") ?? "", /restaurant.*gym/);
    assert.doesNotMatch(byName.get("site_content_draft_schema_valid") ?? "", /gym/);
    assert.doesNotMatch(byName.get("site_content_publication_schema_valid") ?? "", /gym/);

    const restaurantCatalog = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM public.templates
       WHERE industry_key='restaurant' AND status='active'`,
    );
    assert.equal(restaurantCatalog.rows[0].count, 3);

    await client.query(
      `INSERT INTO public.templates(
         id,key,display_name,industry_key,status,description
       ) VALUES(
         'a8bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','gym-test-fixture',
         'Gym fixture','gym','draft','Fixture sin schema, renderer ni versión funcional'
       )`,
    );
    const gymTemplates = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM public.templates WHERE industry_key='gym'`,
    );
    assert.equal(gymTemplates.rows[0].count, 1);

    await client.query("SAVEPOINT unknown_template_industry");
    await expectPgCode(
      () => client.query(
        `INSERT INTO public.templates(
           key,display_name,industry_key,status,description
         ) VALUES(
           'unknown-industry-fixture','Unknown fixture','school','draft',
           'Fixture de industria desconocida que debe ser rechazada'
         )`,
      ),
      "23514",
    );
    await client.query("ROLLBACK TO SAVEPOINT unknown_template_industry");

    await client.query(
      `INSERT INTO public.sites(id,tenant_id,display_name,slug,industry_key)
       VALUES('76666666-6666-4666-8666-666666666666',$1,'Gym aislado','gym-aislado','gym')`,
      [SYNTHETIC_DATA.tenantA.id],
    );
    const gymSite = await client.query<{ industryKey: string }>(
      `SELECT industry_key AS "industryKey" FROM public.sites
       WHERE id='76666666-6666-4666-8666-666666666666'`,
    );
    assert.equal(gymSite.rows[0].industryKey, "gym");

    await client.query("SAVEPOINT unknown_site_industry");
    await expectPgCode(
      () => client.query(
        `UPDATE public.sites SET industry_key='school'
         WHERE id='76666666-6666-4666-8666-666666666666'`,
      ),
      "23514",
    );
    await client.query("ROLLBACK TO SAVEPOINT unknown_site_industry");

    await client.query("SAVEPOINT cross_industry_assignment");
    await expectPgCode(
      () => client.query(
        `INSERT INTO public.site_template_assignments(
           tenant_id,site_id,template_version_id,schema_key,schema_version,
           assigned_by_user_id,idempotency_key
         ) VALUES($1,'76666666-6666-4666-8666-666666666666',$2,'restaurant.v2',2,$3,$4)`,
        [
          SYNTHETIC_DATA.tenantA.id,
          SYNTHETIC_DATA.templateRestaurantV2.id,
          SYNTHETIC_DATA.userA.id,
          "76666666-6666-4666-8666-766666666666",
        ],
      ),
      "23514",
    );
    await client.query("ROLLBACK TO SAVEPOINT cross_industry_assignment");

    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
});
