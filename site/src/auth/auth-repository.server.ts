import "server-only";

import { withApplicationDatabase } from "@/src/db/application-database.server";
import type {
  AssuranceLevel,
  AuthAudience,
  AuthSession,
  AuthTenant,
  LinkedIdentity,
  ProviderIdentity,
} from "./types";

export interface CreateSessionInput {
  tokenHash: Buffer;
  userId: string;
  identityProvider: "supabase" | "test";
  identitySubject: string;
  audience: AuthAudience;
  assuranceLevel: AssuranceLevel;
  activeTenantId: string | null;
  expiresAt: Date;
  userAgentHash: Buffer | null;
  ipHash: Buffer | null;
}

export interface AuditEventInput {
  userId?: string | null;
  tenantId?: string | null;
  provider?: "supabase" | "test" | null;
  audience?: AuthAudience | null;
  eventType:
    | "login_succeeded"
    | "login_failed"
    | "login_rate_limited"
    | "logout"
    | "session_rejected"
    | "session_revoked"
    | "tenant_selected"
    | "password_recovery_requested"
    | "password_reset_completed"
    | "mfa_required"
    | "mfa_succeeded"
    | "access_denied";
  outcome: "succeeded" | "failed" | "blocked";
  correlationId: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function resolveLinkedIdentity(
  identity: Readonly<ProviderIdentity>,
): Promise<LinkedIdentity | null> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{
      userId: string;
      email: string;
      displayName: string;
      userStatus: "active" | "disabled";
    }>(
      `SELECT
         user_id AS "userId",
         email,
         display_name AS "displayName",
         user_status AS "userStatus"
       FROM app_private.resolve_auth_identity($1, $2, $3)`,
      [identity.provider, identity.subject, identity.email],
    );
    const row = result.rows[0];
    return row
      ? {
          userId: row.userId,
          email: row.email,
          displayName: row.displayName,
          status: row.userStatus,
        }
      : null;
  });
}

export async function listAuthTenants(userId: string): Promise<AuthTenant[]> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<AuthTenant>(
      `SELECT
         tenant_id AS "tenantId",
         tenant_slug AS "tenantSlug",
         tenant_name AS "tenantName"
       FROM app_private.list_auth_tenants($1)`,
      [userId],
    );
    return result.rows;
  });
}

export async function isActivePlatformStaff(userId: string): Promise<boolean> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{ allowed: boolean }>(
      "SELECT app_private.is_active_platform_staff($1) AS allowed",
      [userId],
    );
    return result.rows[0]?.allowed === true;
  });
}

export async function createAuthSession(
  input: Readonly<CreateSessionInput>,
): Promise<string> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{ sessionId: string }>(
      `SELECT app_private.create_auth_session(
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
       ) AS "sessionId"`,
      [
        input.tokenHash,
        input.userId,
        input.identityProvider,
        input.identitySubject,
        input.audience,
        input.assuranceLevel,
        input.activeTenantId,
        input.expiresAt,
        input.userAgentHash,
        input.ipHash,
      ],
    );
    return result.rows[0].sessionId;
  });
}

export async function readAuthSession(
  tokenHash: Buffer,
): Promise<AuthSession | null> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{
      sessionId: string;
      userId: string;
      identityProvider: "supabase" | "test";
      identitySubject: string;
      email: string;
      displayName: string;
      audience: AuthAudience;
      assuranceLevel: AssuranceLevel;
      activeTenantId: string | null;
      activeTenantName: string | null;
      expiresAt: Date;
    }>(
      `SELECT
         session_id AS "sessionId",
         user_id AS "userId",
         identity_provider AS "identityProvider",
         identity_subject AS "identitySubject",
         email,
         display_name AS "displayName",
         audience,
         assurance_level AS "assuranceLevel",
         active_tenant_id AS "activeTenantId",
         active_tenant_name AS "activeTenantName",
         expires_at AS "expiresAt"
       FROM app_private.read_auth_session($1)`,
      [tokenHash],
    );
    return result.rows[0] ?? null;
  });
}

export async function revokeAuthSession(
  tokenHash: Buffer,
  reason: string,
): Promise<boolean> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{ revoked: boolean }>(
      "SELECT app_private.revoke_auth_session($1, $2) AS revoked",
      [tokenHash, reason],
    );
    return result.rows[0]?.revoked === true;
  });
}

export async function revokeAllAuthSessions(
  userId: string,
  reason: string,
): Promise<number> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{ revokedCount: number }>(
      `SELECT app_private.revoke_all_auth_sessions($1, $2)
         AS "revokedCount"`,
      [userId, reason],
    );
    return result.rows[0]?.revokedCount ?? 0;
  });
}

export async function rotateAuthSessionTenant(
  oldTokenHash: Buffer,
  newTokenHash: Buffer,
  tenantId: string,
  expiresAt: Date,
  userAgentHash: Buffer | null,
  ipHash: Buffer | null,
): Promise<string> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{ sessionId: string }>(
      `SELECT app_private.rotate_auth_session_tenant(
         $1, $2, $3, $4, $5, $6
       ) AS "sessionId"`,
      [
        oldTokenHash,
        newTokenHash,
        tenantId,
        expiresAt,
        userAgentHash,
        ipHash,
      ],
    );
    return result.rows[0].sessionId;
  });
}

export async function consumeAuthRateLimit(
  scope:
    | "login_ip"
    | "login_identity"
    | "recovery_ip"
    | "recovery_identity"
    | "recovery_verify_ip"
    | "password_reset_ip"
    | "tenant_selection"
    | "admin_mutation"
    | "invitation_acceptance"
    | "client_mutation"
    | "onboarding_public",
  keyHash: Buffer,
  maxAttempts: number,
  windowSeconds: number,
  blockSeconds: number,
): Promise<RateLimitResult> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{
      allowed: boolean;
      retryAfterSeconds: number;
    }>(
      `SELECT
         allowed,
         retry_after_seconds AS "retryAfterSeconds"
       FROM app_private.consume_auth_rate_limit($1, $2, $3, $4, $5)`,
      [scope, keyHash, maxAttempts, windowSeconds, blockSeconds],
    );
    return result.rows[0];
  });
}

export async function registerRecoveryGrant(
  grantHash: Buffer,
  expiresAt: Date,
): Promise<void> {
  await withApplicationDatabase(async (pool) => {
    await pool.query(
      "SELECT app_private.register_auth_recovery_grant($1, $2)",
      [grantHash, expiresAt],
    );
  });
}

export async function consumeRecoveryGrant(
  grantHash: Buffer,
): Promise<boolean> {
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<{ consumed: boolean }>(
      "SELECT app_private.consume_auth_recovery_grant($1) AS consumed",
      [grantHash],
    );
    return result.rows[0]?.consumed === true;
  });
}

export async function writeAuthAuditEvent(
  input: Readonly<AuditEventInput>,
): Promise<void> {
  await withApplicationDatabase(async (pool) => {
    await pool.query(
      `SELECT app_private.write_auth_audit_event(
         $1, $2, $3, $4, $5, $6, $7, $8::jsonb
       )`,
      [
        input.userId ?? null,
        input.tenantId ?? null,
        input.provider ?? null,
        input.audience ?? null,
        input.eventType,
        input.outcome,
        input.correlationId,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  });
}
