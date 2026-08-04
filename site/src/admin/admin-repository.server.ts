import "server-only";

import { withApplicationDatabase } from "@/src/db/application-database.server";
import type {
  AdminActor,
  AuditRecord,
  DashboardSummary,
  InvitationRecord,
  MembershipRecord,
  TenantListItem,
  TenantRecord,
  TenantStatus,
  AuditOutcome,
} from "./types";

function count(value: number | string): number {
  return Number(value);
}

export async function readDashboard(
  actor: Readonly<AdminActor>,
): Promise<DashboardSummary> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{
      tenantTotal: string;
      tenantActive: string;
      tenantSuspended: string;
      invitationPending: string;
      invitationExpired: string;
      membershipActive: string;
    }>(
      `SELECT
         tenant_total AS "tenantTotal",
         tenant_active AS "tenantActive",
         tenant_suspended AS "tenantSuspended",
         invitation_pending AS "invitationPending",
         invitation_expired AS "invitationExpired",
         membership_active AS "membershipActive"
       FROM app_private.admin_dashboard($1, $2)`,
      [actor.sessionId, actor.userId],
    );
    const row = result.rows[0];
    return {
      tenantTotal: count(row.tenantTotal),
      tenantActive: count(row.tenantActive),
      tenantSuspended: count(row.tenantSuspended),
      invitationPending: count(row.invitationPending),
      invitationExpired: count(row.invitationExpired),
      membershipActive: count(row.membershipActive),
    };
  });
}

export async function listTenants(
  actor: Readonly<AdminActor>,
  input: Readonly<{
    search: string | null;
    status: TenantStatus | null;
    sort: "created_desc" | "name_asc";
    limit: number;
    offset: number;
  }>,
): Promise<TenantListItem[]> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<TenantListItem & { totalCount: string }>(
      `SELECT
         tenant_id AS "tenantId",
         tenant_slug AS "tenantSlug",
         tenant_name AS "tenantName",
         tenant_status AS "tenantStatus",
         tenant_timezone AS "tenantTimezone",
         tenant_locale AS "tenantLocale",
         tenant_created_at AS "tenantCreatedAt",
         tenant_updated_at AS "tenantUpdatedAt",
         total_count AS "totalCount"
       FROM app_private.admin_list_tenants($1,$2,$3,$4,$5,$6,$7)`,
      [
        actor.sessionId,
        actor.userId,
        input.search,
        input.status,
        input.sort,
        input.limit,
        input.offset,
      ],
    );
    return result.rows.map((row) => ({
      ...row,
      totalCount: count(row.totalCount),
    }));
  });
}

export async function getTenant(
  actor: Readonly<AdminActor>,
  tenantId: string,
): Promise<TenantRecord | null> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<TenantRecord>(
      `SELECT
         tenant_id AS "tenantId",
         tenant_slug AS "tenantSlug",
         tenant_name AS "tenantName",
         tenant_status AS "tenantStatus",
         tenant_timezone AS "tenantTimezone",
         tenant_locale AS "tenantLocale",
         tenant_created_at AS "tenantCreatedAt",
         tenant_updated_at AS "tenantUpdatedAt"
       FROM app_private.admin_get_tenant($1,$2,$3)`,
      [actor.sessionId, actor.userId, tenantId],
    );
    return result.rows[0] ?? null;
  });
}

export async function listMemberships(
  actor: Readonly<AdminActor>,
  tenantId: string,
): Promise<MembershipRecord[]> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<MembershipRecord>(
      `SELECT
         membership_id AS "membershipId",
         user_id AS "userId",
         user_name AS "userName",
         user_email AS "userEmail",
         membership_status AS "membershipStatus",
         membership_created_at AS "membershipCreatedAt",
         membership_updated_at AS "membershipUpdatedAt"
       FROM app_private.admin_list_memberships($1,$2,$3)`,
      [actor.sessionId, actor.userId, tenantId],
    );
    return result.rows;
  });
}

export async function listInvitations(
  actor: Readonly<AdminActor>,
  input: Readonly<{
    tenantId: string | null;
    status: string | null;
    limit: number;
    offset: number;
  }>,
): Promise<InvitationRecord[]> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<
      InvitationRecord & { totalCount: string }
    >(
      `SELECT
         invitation_id AS "invitationId",
         tenant_id AS "tenantId",
         tenant_name AS "tenantName",
         invitation_email AS "invitationEmail",
         invitation_name AS "invitationName",
         invitation_status AS "invitationStatus",
         invitation_provider AS "invitationProvider",
         invitation_expires_at AS "invitationExpiresAt",
         invitation_accepted_at AS "invitationAcceptedAt",
         invitation_created_at AS "invitationCreatedAt",
         invitation_attempt_count AS "invitationAttemptCount",
         total_count AS "totalCount"
       FROM app_private.admin_list_invitations($1,$2,$3,$4,$5,$6)`,
      [
        actor.sessionId,
        actor.userId,
        input.tenantId,
        input.status,
        input.limit,
        input.offset,
      ],
    );
    return result.rows.map((row) => ({
      ...row,
      totalCount: count(row.totalCount),
    }));
  });
}

export async function listAudit(
  actor: Readonly<AdminActor>,
  input: Readonly<{
    action: string | null;
    tenantId: string | null;
    actorSearch: string | null;
    from: Date | null;
    to: Date | null;
    outcome: AuditOutcome | null;
    limit: number;
    offset: number;
  }>,
): Promise<AuditRecord[]> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<AuditRecord & { totalCount: string }>(
      `SELECT
         audit_id AS "auditId",
         occurred_at AS "occurredAt",
         actor_name AS "actorName",
         actor_email AS "actorEmail",
         tenant_id AS "tenantId",
         tenant_name AS "tenantName",
         action,
         resource_type AS "resourceType",
         resource_id AS "resourceId",
         outcome,
         correlation_id AS "correlationId",
         reason,
         previous_state AS "previousState",
         new_state AS "newState",
         metadata,
         total_count AS "totalCount"
       FROM app_private.admin_list_audit_events($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        actor.sessionId,
        actor.userId,
        input.action,
        input.tenantId,
        input.actorSearch,
        input.from,
        input.to,
        input.outcome,
        input.limit,
        input.offset,
      ],
    );
    return result.rows.map((row) => ({
      ...row,
      auditId: count(row.auditId),
      totalCount: count(row.totalCount),
    }));
  });
}

export async function createTenant(
  actor: Readonly<AdminActor>,
  input: Readonly<{
    idempotencyKey: string;
    fingerprint: string;
    displayName: string;
    slug: string;
    timezone: string;
    locale: string;
    correlationId: string;
  }>,
): Promise<string> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{ tenantId: string }>(
      `SELECT app_private.admin_create_tenant(
         $1,$2,$3,$4,$5,$6,$7,$8,$9
       ) AS "tenantId"`,
      [
        actor.sessionId,
        actor.userId,
        input.idempotencyKey,
        input.fingerprint,
        input.displayName,
        input.slug,
        input.timezone,
        input.locale,
        input.correlationId,
      ],
    );
    return result.rows[0].tenantId;
  });
}

export async function updateTenant(
  actor: Readonly<AdminActor>,
  input: Readonly<{
    tenantId: string;
    expectedUpdatedAt: Date;
    displayName: string;
    slug: string;
    timezone: string;
    locale: string;
    correlationId: string;
  }>,
): Promise<Date> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{ updatedAt: Date }>(
      `SELECT app_private.admin_update_tenant(
         $1,$2,$3,$4,$5,$6,$7,$8,$9
       ) AS "updatedAt"`,
      [
        actor.sessionId,
        actor.userId,
        input.tenantId,
        input.expectedUpdatedAt,
        input.displayName,
        input.slug,
        input.timezone,
        input.locale,
        input.correlationId,
      ],
    );
    return result.rows[0].updatedAt;
  });
}

export async function setTenantStatus(
  actor: Readonly<AdminActor>,
  tenantId: string,
  status: "active" | "suspended",
  reason: string,
  correlationId: string,
): Promise<boolean> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{ changed: boolean }>(
      `SELECT app_private.admin_set_tenant_status(
         $1,$2,$3,$4,$5,$6
       ) AS changed`,
      [actor.sessionId, actor.userId, tenantId, status, reason, correlationId],
    );
    return result.rows[0]?.changed === true;
  });
}

export async function reserveInvitation(
  actor: Readonly<AdminActor>,
  input: Readonly<{
    tenantId: string;
    idempotencyKey: string;
    fingerprint: string;
    email: string;
    displayName: string;
    provider: "supabase" | "test";
    expiresAt: Date;
  }>,
): Promise<{ invitationId: string; shouldDispatch: boolean }> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{
      invitationId: string;
      shouldDispatch: boolean;
    }>(
      `SELECT
         invitation_id AS "invitationId",
         should_dispatch AS "shouldDispatch"
       FROM app_private.admin_reserve_invitation(
         $1,$2,$3,$4,$5,$6,$7,$8,$9
       )`,
      [
        actor.sessionId,
        actor.userId,
        input.tenantId,
        input.idempotencyKey,
        input.fingerprint,
        input.email,
        input.displayName,
        input.provider,
        input.expiresAt,
      ],
    );
    return result.rows[0];
  });
}

export async function completeInvitation(
  actor: Readonly<AdminActor>,
  invitationId: string,
  providerReference: string,
  expiresAt: Date,
  correlationId: string,
): Promise<void> {
  await withApplicationDatabase((pool) =>
    pool.query(
      "SELECT app_private.admin_complete_invitation($1,$2,$3,$4,$5,$6)",
      [
        actor.sessionId,
        actor.userId,
        invitationId,
        providerReference,
        expiresAt,
        correlationId,
      ],
    ),
  );
}

export async function failInvitation(
  actor: Readonly<AdminActor>,
  invitationId: string,
  reason: string,
  correlationId: string,
): Promise<void> {
  await withApplicationDatabase((pool) =>
    pool.query(
      "SELECT app_private.admin_fail_invitation($1,$2,$3,$4,$5)",
      [actor.sessionId, actor.userId, invitationId, reason, correlationId],
    ),
  );
}

export async function prepareInvitationResend(
  actor: Readonly<AdminActor>,
  invitationId: string,
  expiresAt: Date,
): Promise<{
  invitationEmail: string;
  invitationName: string;
  invitationProvider: "supabase" | "test";
}> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{
      invitationEmail: string;
      invitationName: string;
      invitationProvider: "supabase" | "test";
    }>(
      `SELECT
         invitation_email AS "invitationEmail",
         invitation_name AS "invitationName",
         invitation_provider AS "invitationProvider"
       FROM app_private.admin_prepare_invitation_resend($1,$2,$3,$4)`,
      [actor.sessionId, actor.userId, invitationId, expiresAt],
    );
    return result.rows[0];
  });
}

export async function revokeInvitation(
  actor: Readonly<AdminActor>,
  invitationId: string,
  reason: string,
  correlationId: string,
): Promise<boolean> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{ changed: boolean }>(
      "SELECT app_private.admin_revoke_invitation($1,$2,$3,$4,$5) AS changed",
      [actor.sessionId, actor.userId, invitationId, reason, correlationId],
    );
    return result.rows[0]?.changed === true;
  });
}

export async function acceptInvitation(input: Readonly<{
  provider: "supabase" | "test";
  providerReference: string;
  providerSubject: string;
  email: string;
  displayName: string;
  correlationId: string;
}>): Promise<{ tenantId: string; userId: string; membershipId: string }> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{
      tenantId: string;
      userId: string;
      membershipId: string;
    }>(
      `SELECT
         accepted_tenant_id AS "tenantId",
         accepted_user_id AS "userId",
         accepted_membership_id AS "membershipId"
       FROM app_private.accept_tenant_invitation($1,$2,$3,$4,$5,$6)`,
      [
        input.provider,
        input.providerReference,
        input.providerSubject,
        input.email,
        input.displayName,
        input.correlationId,
      ],
    );
    return result.rows[0];
  });
}

export async function setMembershipStatus(
  actor: Readonly<AdminActor>,
  membershipId: string,
  status: "active" | "disabled",
  reason: string,
  correlationId: string,
): Promise<boolean> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{ changed: boolean }>(
      "SELECT app_private.admin_set_membership_status($1,$2,$3,$4,$5,$6) AS changed",
      [
        actor.sessionId,
        actor.userId,
        membershipId,
        status,
        reason,
        correlationId,
      ],
    );
    return result.rows[0]?.changed === true;
  });
}

export async function recordAdminAccessDenied(input: Readonly<{
  userId: string | null;
  correlationId: string;
  reason: string;
  metadata?: Record<string, string>;
}>): Promise<void> {
  await withApplicationDatabase((pool) =>
    pool.query(
      "SELECT app_private.record_admin_access_denied($1,$2,$3,$4::jsonb)",
      [
        input.userId,
        input.correlationId,
        input.reason,
        JSON.stringify(input.metadata ?? {}),
      ],
    ),
  );
}
