import type {
  RestaurantContentV2,
  RestaurantDay,
  RestaurantMediaUsage,
} from "@/src/content/types";

export const ONBOARDING_INDUSTRIES = [
  "restaurant",
  "cafe",
  "hotel",
  "hostel",
  "gym",
  "school",
  "clinic",
  "professional_services",
  "other",
] as const;

export const ONBOARDING_SOURCES = [
  "public_form",
  "whatsapp",
  "phone",
  "referral",
  "manual",
  "other",
] as const;

export const ONBOARDING_CASE_STATUSES = [
  "received",
  "pending_review",
  "waiting_information",
  "preparing",
  "internal_review",
  "waiting_client_approval",
  "ready_to_publish",
  "published",
  "paused",
  "canceled",
] as const;

export type OnboardingIndustry = (typeof ONBOARDING_INDUSTRIES)[number];
export type OnboardingSource = (typeof ONBOARDING_SOURCES)[number];
export type OnboardingCaseStatus = (typeof ONBOARDING_CASE_STATUSES)[number];
export type OnboardingPriority = "normal" | "high" | "urgent";

export interface RestaurantOnboardingAnswersV1 {
  company: {
    businessName: string;
    tagline: string;
    shortDescription: string;
    legalName: string;
  };
  objectives: {
    primaryGoal: string;
    targetAudience: string;
    desiredTone: string;
    primaryCallToAction: {
      label: string;
      type: "menu" | "phone" | "whatsapp" | "map";
      target: string;
    };
  };
  about: {
    title: string;
    description: string;
  };
  menu: {
    sectionTitle: string;
    categories: Array<{
      id: string;
      name: string;
      description: string;
      order: number;
    }>;
    items: Array<{
      id: string;
      categoryId: string;
      name: string;
      description: string;
      priceText: string;
      availability: boolean;
      order: number;
      media: RestaurantMediaUsage | null;
    }>;
  };
  hours: Array<{
    day: RestaurantDay;
    isOpen: boolean;
    openingTime: string;
    closingTime: string;
    note: string;
  }>;
  contact: {
    publicEmail: string;
    publicPhone: string;
    whatsappPhone: string;
    address: string;
    city: string;
    mapUrl: string;
  };
  social: {
    instagram: string;
    facebook: string;
    tiktok: string;
  };
  seo: {
    title: string;
    description: string;
  };
  media: {
    hero: RestaurantMediaUsage | null;
  };
}

export interface IntakeRecord {
  id: string;
  source: OnboardingSource;
  status: string;
  businessName: string;
  businessCategory: OnboardingIndustry;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  preferredContactMethod: string;
  city: string | null;
  currentDigitalPresence: string;
  primaryGoal: string;
  shortNotes: string | null;
  supportedCategory: boolean;
  conversionStatus: string;
  version: number;
  submittedAt: Date;
  updatedAt: Date;
  totalCount?: number;
}

export interface OnboardingCaseRecord {
  id: string;
  tenantId: string;
  tenantName: string;
  siteId: string;
  siteName: string;
  siteSlug: string;
  status: OnboardingCaseStatus;
  previousStatus: OnboardingCaseStatus | null;
  priority: OnboardingPriority;
  assignedAdminName: string | null;
  linkedConversationId: string | null;
  targetTemplateVersionId: string;
  answers: RestaurantOnboardingAnswersV1 | null;
  answersRevision: number | null;
  answersCompletionState: string | null;
  draftRevision: number | null;
  approvalId: string | null;
  approvalStatus: string | null;
  approvalChecksum: string | null;
  publicationId: string | null;
  version: number;
  updatedAt: Date;
}

export interface OnboardingDraftResult {
  caseId: string;
  siteId: string;
  draftId: string;
  draftRevision: number;
  content: RestaurantContentV2;
  checksum: string;
}

export interface ClientOnboardingWorkspace {
  id: string;
  tenantId: string;
  tenantName: string;
  siteId: string;
  siteName: string;
  siteSlug: string;
  status: OnboardingCaseStatus;
  linkedConversationId: string | null;
  targetTemplateVersionId: string;
  answers: RestaurantOnboardingAnswersV1 | null;
  answersRevision: number | null;
  answersCompletionState: string | null;
  draftRevision: number | null;
  approvalId: string | null;
  approvalStatus: string | null;
  publicationId: string | null;
  version: number;
  updatedAt: Date;
  visibleChecklist: Array<{
    itemKey: string;
    displayName: string;
    status: string;
    displayOrder: number;
  }>;
  progress: Array<{
    key: string;
    label: string;
    complete: boolean;
    current: boolean;
  }>;
}
