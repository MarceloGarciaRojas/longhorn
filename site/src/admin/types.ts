export type TenantStatus = "draft" | "active" | "suspended";
export type InvitationStatus =
  | "pending"
  | "accepted"
  | "expired"
  | "revoked"
  | "failed";
export type AuditOutcome = "succeeded" | "failed" | "blocked";

export interface AdminActor {
  sessionId: string;
  userId: string;
}

export interface DashboardSummary {
  tenantTotal: number;
  tenantActive: number;
  tenantSuspended: number;
  invitationPending: number;
  invitationExpired: number;
  membershipActive: number;
}

export interface TenantRecord {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantStatus: TenantStatus;
  tenantTimezone: string;
  tenantLocale: string;
  tenantCreatedAt: Date;
  tenantUpdatedAt: Date;
}

export interface TenantListItem extends TenantRecord {
  totalCount: number;
}

export interface MembershipRecord {
  membershipId: string;
  userId: string;
  userName: string;
  userEmail: string;
  membershipStatus: "active" | "disabled";
  membershipCreatedAt: Date;
  membershipUpdatedAt: Date;
}

export interface InvitationRecord {
  invitationId: string;
  tenantId: string;
  tenantName: string;
  invitationEmail: string;
  invitationName: string;
  invitationStatus: InvitationStatus;
  invitationProvider: "supabase" | "test";
  invitationExpiresAt: Date;
  invitationAcceptedAt: Date | null;
  invitationCreatedAt: Date;
  invitationAttemptCount: number;
  totalCount: number;
}

export interface AuditRecord {
  auditId: number;
  occurredAt: Date;
  actorName: string | null;
  actorEmail: string | null;
  tenantId: string | null;
  tenantName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: AuditOutcome;
  correlationId: string;
  reason: string | null;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  totalCount: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
