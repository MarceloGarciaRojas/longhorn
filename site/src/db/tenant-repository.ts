import type { PoolClient } from "pg";

export interface TenantRecord {
  id: string;
  slug: string;
  displayName: string;
  status: "active" | "suspended" | "archived";
}

export interface MembershipRecord {
  id: string;
  tenantId: string;
  userId: string;
  status: "active" | "disabled";
}

export interface VisibleUserRecord {
  id: string;
  email: string;
  displayName: string;
  status: "active" | "disabled";
}

export async function getCurrentTenant(
  client: PoolClient,
): Promise<TenantRecord | null> {
  const result = await client.query<TenantRecord>(
    `SELECT
       id,
       slug,
       display_name AS "displayName",
       status
     FROM public.tenants
     WHERE id = app_context.current_tenant_id()`,
  );
  return result.rows[0] ?? null;
}

export async function getTenantById(
  client: PoolClient,
  tenantId: string,
): Promise<TenantRecord | null> {
  const result = await client.query<TenantRecord>(
    `SELECT
       id,
       slug,
       display_name AS "displayName",
       status
     FROM public.tenants
     WHERE id = $1`,
    [tenantId],
  );
  return result.rows[0] ?? null;
}

export async function listCurrentTenantMemberships(
  client: PoolClient,
): Promise<MembershipRecord[]> {
  const result = await client.query<MembershipRecord>(
    `SELECT
       id,
       tenant_id AS "tenantId",
       user_id AS "userId",
       status
     FROM public.tenant_memberships
     ORDER BY id`,
  );
  return result.rows;
}

export async function getMembershipById(
  client: PoolClient,
  membershipId: string,
): Promise<MembershipRecord | null> {
  const result = await client.query<MembershipRecord>(
    `SELECT
       id,
       tenant_id AS "tenantId",
       user_id AS "userId",
       status
     FROM public.tenant_memberships
     WHERE id = $1`,
    [membershipId],
  );
  return result.rows[0] ?? null;
}

export async function listVisibleUsers(
  client: PoolClient,
): Promise<VisibleUserRecord[]> {
  const result = await client.query<VisibleUserRecord>(
    `SELECT
       id,
       email,
       display_name AS "displayName",
       status
     FROM public.users
     ORDER BY id`,
  );
  return result.rows;
}

export async function getVisibleUserById(
  client: PoolClient,
  userId: string,
): Promise<VisibleUserRecord | null> {
  const result = await client.query<VisibleUserRecord>(
    `SELECT
       id,
       email,
       display_name AS "displayName",
       status
     FROM public.users
     WHERE id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}
