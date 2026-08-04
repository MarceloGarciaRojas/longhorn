export type ClientCompanyStatus = "active" | "suspended" | "archived";
export type ClientMembershipStatus = "active" | "disabled";
export type SiteStatus = "preparing" | "active" | "suspended";
export type PlanAssignmentStatus = "pending" | "active" | "paused" | "ended";

export interface ClientCompany {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantStatus: ClientCompanyStatus;
  membershipStatus: ClientMembershipStatus;
  isAvailable: boolean;
}

export interface ClientDashboard {
  tenantName: string;
  tenantStatus: ClientCompanyStatus;
  siteCount: number;
  planName: string | null;
  planStatus: PlanAssignmentStatus | null;
}

export interface ClientSite {
  id: string;
  displayName: string;
  slug: string;
  status: SiteStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientPlanFeature {
  key: string;
  displayName: string;
  detail: string | null;
}

export interface ClientPlan {
  code: string;
  displayName: string;
  description: string;
  status: PlanAssignmentStatus;
  startsAt: Date | null;
  referenceDate: string | null;
  features: ClientPlanFeature[];
}

export interface PersonalProfile {
  displayName: string;
  email: string;
  phone: string;
  locale: string;
  version: number;
  updatedAt: Date;
}

export interface CompanyProfile {
  displayName: string;
  legalName: string;
  contactEmail: string;
  contactPhone: string;
  description: string;
  timezone: string;
  locale: string;
  version: number;
  updatedAt: Date;
}

export interface PersonalProfileUpdate {
  displayName: string;
  phone: string | null;
  locale: string;
  expectedVersion: number;
}

export interface CompanyProfileUpdate {
  displayName: string;
  legalName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  description: string | null;
  timezone: string;
  locale: string;
  expectedVersion: number;
}
