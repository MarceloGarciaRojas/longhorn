import "server-only";

import type { PoolClient } from "pg";
import { withApplicationDatabase } from "@/src/db/application-database.server";
import type { AuthSession } from "@/src/auth/types";
import type {
  ClientCompany,
  ClientDashboard,
  ClientPlan,
  ClientPlanFeature,
  ClientSite,
  CompanyProfile,
  CompanyProfileUpdate,
  PersonalProfile,
  PersonalProfileUpdate,
} from "./types";

export async function listClientCompanies(
  session: Readonly<AuthSession>,
): Promise<ClientCompany[]> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<ClientCompany>(
      `SELECT
         tenant_id AS "tenantId",
         tenant_slug AS "tenantSlug",
         tenant_name AS "tenantName",
         tenant_status AS "tenantStatus",
         membership_status AS "membershipStatus",
         is_available AS "isAvailable"
       FROM app_private.list_client_companies($1, $2)`,
      [session.sessionId, session.userId],
    );
    return result.rows;
  });
}

export async function getClientDashboard(
  client: PoolClient,
): Promise<ClientDashboard | null> {
  const result = await client.query<ClientDashboard>(
    `SELECT
       tenant.display_name AS "tenantName",
       tenant.status AS "tenantStatus",
       (
         SELECT count(*)::integer
         FROM public.sites AS site
         WHERE site.tenant_id = tenant.id
           AND site.deleted_at IS NULL
       ) AS "siteCount",
       plan.display_name AS "planName",
       assignment.status AS "planStatus"
     FROM public.tenants AS tenant
     LEFT JOIN public.tenant_plan_assignments AS assignment
       ON assignment.tenant_id = tenant.id
     LEFT JOIN public.plans AS plan ON plan.id = assignment.plan_id
     WHERE tenant.id = app_context.current_tenant_id()`,
  );
  return result.rows[0] ?? null;
}

export async function listClientSites(
  client: PoolClient,
): Promise<ClientSite[]> {
  const result = await client.query<ClientSite>(
    `SELECT
       id,
       display_name AS "displayName",
       slug,
       status,
       created_at AS "createdAt",
       updated_at AS "updatedAt"
     FROM public.sites
     WHERE tenant_id = app_context.current_tenant_id()
       AND deleted_at IS NULL
     ORDER BY created_at DESC, id`,
  );
  return result.rows;
}

export async function getClientPlan(
  client: PoolClient,
): Promise<ClientPlan | null> {
  const assignment = await client.query<Omit<ClientPlan, "features">>(
    `SELECT
       plan.code,
       plan.display_name AS "displayName",
       plan.description,
       assignment.status,
       assignment.starts_at AS "startsAt",
       assignment.reference_date::text AS "referenceDate"
     FROM public.tenant_plan_assignments AS assignment
     JOIN public.plans AS plan ON plan.id = assignment.plan_id
     WHERE assignment.tenant_id = app_context.current_tenant_id()`,
  );
  const current = assignment.rows[0];
  if (!current) return null;
  const features = await client.query<ClientPlanFeature>(
    `SELECT
       feature.feature_key AS key,
       feature.display_name AS "displayName",
       feature.detail
     FROM public.plan_features AS feature
     JOIN public.plans AS plan ON plan.id = feature.plan_id
     JOIN public.tenant_plan_assignments AS assignment
       ON assignment.plan_id = plan.id
     WHERE assignment.tenant_id = app_context.current_tenant_id()
       AND feature.status = 'active'
     ORDER BY feature.display_order, feature.id`,
  );
  return { ...current, features: features.rows };
}

export async function getPersonalProfile(
  client: PoolClient,
): Promise<PersonalProfile | null> {
  const result = await client.query<PersonalProfile>(
    `SELECT
       account.display_name AS "displayName",
       account.email,
       COALESCE(profile.phone, '') AS phone,
       COALESCE(profile.locale, 'es-CL') AS locale,
       COALESCE(profile.version, 0) AS version,
       COALESCE(profile.updated_at, account.updated_at) AS "updatedAt"
     FROM public.users AS account
     LEFT JOIN public.user_profiles AS profile ON profile.user_id = account.id
     WHERE account.id = app_context.current_user_id()`,
  );
  return result.rows[0] ?? null;
}

export async function getCompanyProfile(
  client: PoolClient,
): Promise<CompanyProfile | null> {
  const result = await client.query<CompanyProfile>(
    `SELECT
       tenant.display_name AS "displayName",
       COALESCE(profile.legal_name, '') AS "legalName",
       COALESCE(profile.contact_email, '') AS "contactEmail",
       COALESCE(profile.contact_phone, '') AS "contactPhone",
       COALESCE(profile.description, '') AS description,
       tenant.timezone,
       tenant.locale,
       COALESCE(profile.version, 0) AS version,
       COALESCE(profile.updated_at, tenant.updated_at) AS "updatedAt"
     FROM public.tenants AS tenant
     LEFT JOIN public.tenant_profiles AS profile
       ON profile.tenant_id = tenant.id
     WHERE tenant.id = app_context.current_tenant_id()`,
  );
  return result.rows[0] ?? null;
}

export async function updatePersonalProfile(
  client: PoolClient,
  input: Readonly<PersonalProfileUpdate>,
): Promise<number | null> {
  await client.query(
    `SELECT id
     FROM public.users
     WHERE id = app_context.current_user_id()
     FOR UPDATE`,
  );
  const current = await getPersonalProfile(client);
  if (!current || current.version !== input.expectedVersion) return null;
  await client.query(
    `UPDATE public.users
     SET display_name = $1
     WHERE id = app_context.current_user_id()`,
    [input.displayName],
  );
  if (current.version === 0) {
    const inserted = await client.query<{ version: number }>(
      `INSERT INTO public.user_profiles (user_id, phone, locale)
       VALUES (app_context.current_user_id(), $1, $2)
       RETURNING version`,
      [input.phone, input.locale],
    );
    return inserted.rows[0]?.version ?? null;
  }
  const updated = await client.query<{ version: number }>(
    `UPDATE public.user_profiles
     SET phone = $1,
         locale = $2,
         version = version + 1
     WHERE user_id = app_context.current_user_id()
       AND version = $3
     RETURNING version`,
    [input.phone, input.locale, input.expectedVersion],
  );
  return updated.rows[0]?.version ?? null;
}

export async function updateCompanyProfile(
  client: PoolClient,
  input: Readonly<CompanyProfileUpdate>,
): Promise<number | null> {
  await client.query(
    `SELECT id
     FROM public.tenants
     WHERE id = app_context.current_tenant_id()
     FOR UPDATE`,
  );
  const current = await getCompanyProfile(client);
  if (!current || current.version !== input.expectedVersion) return null;
  await client.query(
    `UPDATE public.tenants
     SET display_name = $1,
         timezone = $2,
         locale = $3
     WHERE id = app_context.current_tenant_id()`,
    [input.displayName, input.timezone, input.locale],
  );
  if (current.version === 0) {
    const inserted = await client.query<{ version: number }>(
      `INSERT INTO public.tenant_profiles (
         tenant_id, legal_name, contact_email, contact_phone, description
       )
       VALUES (app_context.current_tenant_id(), $1, $2, $3, $4)
       RETURNING version`,
      [
        input.legalName,
        input.contactEmail,
        input.contactPhone,
        input.description,
      ],
    );
    return inserted.rows[0]?.version ?? null;
  }
  const updated = await client.query<{ version: number }>(
    `UPDATE public.tenant_profiles
     SET legal_name = $1,
         contact_email = $2,
         contact_phone = $3,
         description = $4,
         version = version + 1
     WHERE tenant_id = app_context.current_tenant_id()
       AND version = $5
     RETURNING version`,
    [
      input.legalName,
      input.contactEmail,
      input.contactPhone,
      input.description,
      input.expectedVersion,
    ],
  );
  return updated.rows[0]?.version ?? null;
}

export async function recordClientEvent(
  client: PoolClient,
  input: Readonly<{
    session: AuthSession;
    action:
      | "client_panel_accessed"
      | "personal_profile_updated"
      | "tenant_profile_updated"
      | "deletion_requested"
      | "deletion_canceled"
      | "domain_requested"
      | "conversation_created"
      | "conversation_closed"
        | "conversation_reopened"
        | "support_message_sent"
        | "operation_access_denied"
        | "content_draft_saved"
        | "content_edit_conflict"
        | "content_previewed"
        | "content_published"
        | "content_restored"
        | "content_publish_rejected"
        | "content_access_denied";
    resourceType:
      | "client_route"
      | "user_profile"
      | "tenant_profile"
      | "site"
      | "deletion_request"
        | "domain_request"
        | "conversation"
        | "message"
        | "content_draft"
        | "content_publication"
        | "public_site";
    resourceId: string;
    correlationId: string;
    previousState?: Record<string, unknown>;
    newState?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>,
): Promise<void> {
  await client.query(
    `SELECT app_private.client_record_event(
       $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb
     )`,
    [
      input.session.sessionId,
      input.session.userId,
      input.session.activeTenantId,
      input.action,
      input.resourceType,
      input.resourceId,
      input.correlationId,
      input.previousState ? JSON.stringify(input.previousState) : null,
      input.newState ? JSON.stringify(input.newState) : null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}
