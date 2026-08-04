export type SiteStatus =
  | "preparing"
  | "active"
  | "suspended"
  | "deletion_requested"
  | "archived";
export type DeletionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "canceled"
  | "executed";
export type DomainRequestStatus =
  | "submitted"
  | "reviewing"
  | "awaiting_client"
  | "registering"
  | "pending_dns"
  | "verifying"
  | "active"
  | "rejected"
  | "canceled"
  | "failed";
export type ConversationStatus =
  | "open"
  | "awaiting_nexi"
  | "awaiting_client"
  | "closed";
export type ConversationPriority = "normal" | "high" | "urgent";

export interface SiteRecord {
  id: string;
  tenantId: string;
  tenantName?: string;
  displayName: string;
  slug: string;
  status: SiteStatus;
  version: number;
  hostname: string | null;
  deletionStatus: DeletionStatus | null;
  deletionRequestId: string | null;
  domainRequestStatus: DomainRequestStatus | null;
  domainRequestId: string | null;
  canRequestDomain?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeletionRequestRecord {
  id: string;
  tenantId: string;
  tenantName?: string;
  siteId: string;
  siteName: string;
  reason: string;
  status: DeletionStatus;
  graceHours: number;
  requestedAt: Date;
  eligibleAt: Date;
  reviewNote: string | null;
  version: number;
}

export interface DomainRequestRecord {
  id: string;
  tenantId: string;
  tenantName?: string;
  siteId: string;
  siteName: string;
  requestType: "connect_existing" | "register_new" | "advice_required";
  desiredDomain: string | null;
  alternatives: string | null;
  clientNotes: string | null;
  internalNote?: string | null;
  status: DomainRequestStatus;
  version: number;
  createdAt: Date;
}

export interface DomainRecord {
  id: string;
  tenantId: string;
  siteId: string;
  hostname: string;
  domainType: "nexi_subdomain" | "custom_domain";
  status: "pending" | "active" | "error" | "disabled";
  isPrimary: boolean;
  verificationStatus: "unverified" | "pending" | "verified" | "failed";
  verifiedAt: Date | null;
  activatedAt: Date | null;
  version: number;
}

export interface SiteActivityRecord {
  id: number;
  action: string;
  outcome: string;
  occurredAt: Date;
}

export interface ConversationRecord {
  id: string;
  tenantId: string;
  tenantName?: string;
  siteId: string | null;
  subject: string;
  category: string;
  status: ConversationStatus;
  priority: ConversationPriority;
  assignedToUserId?: string | null;
  unreadCount: number;
  lastMessageAt: Date;
  version: number;
}

export interface SupportMessageRecord {
  id: string;
  senderScope: "client_admin" | "nexi_admin";
  senderName: string;
  body: string;
  createdAt: Date;
}
