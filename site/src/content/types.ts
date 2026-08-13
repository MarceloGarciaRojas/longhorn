import type { IndustryKey } from "./industry";

export const RESTAURANT_SCHEMA_KEY = "restaurant.v1";
export const RESTAURANT_SCHEMA_VERSION = 1;
export const RESTAURANT_RENDERER_KEY = "restaurant-classic-v1";
export const RESTAURANT_V2_SCHEMA_KEY = "restaurant.v2";
export const RESTAURANT_V2_SCHEMA_VERSION = 2;
export const RESTAURANT_CLASSIC_V2_RENDERER_KEY = "restaurant-classic-v2";
export const RESTAURANT_MODERN_RENDERER_KEY = "restaurant-modern-v1";
export const RESTAURANT_EDITORIAL_RENDERER_KEY = "restaurant-editorial-v1";
export const RESTAURANT_EDITORIAL_TEMPLATE_KEY = "restaurant-editorial";
export const GYM_SCHEMA_KEY = "gym.v1";
export const GYM_SCHEMA_VERSION = 1;
export const GYM_PULSO_RENDERER_KEY = "gym-pulso-v1";

export const RESTAURANT_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export const RESTAURANT_MEDIA_REFERENCES = [
  "placeholder",
  "restaurant-hero",
  "restaurant-dish-a",
  "restaurant-dish-b",
  "restaurant-dessert",
] as const;

export type RestaurantDay = (typeof RESTAURANT_DAYS)[number];
export type RestaurantMediaReference =
  (typeof RESTAURANT_MEDIA_REFERENCES)[number];
export type RestaurantCtaType = "menu" | "phone" | "whatsapp" | "map";

export interface RestaurantCategory {
  id: string;
  name: string;
  description: string;
  order: number;
}

export interface RestaurantItem {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price_text: string;
  availability: boolean;
  order: number;
  media_reference: RestaurantMediaReference | "";
}

export interface RestaurantHours {
  day: RestaurantDay;
  is_open: boolean;
  opening_time: string;
  closing_time: string;
  note: string;
}

export interface RestaurantContent {
  identity: {
    business_name: string;
    short_description: string;
    tagline: string;
  };
  hero: {
    headline: string;
    subheadline: string;
    primary_cta_label: string;
    primary_cta_type: RestaurantCtaType;
    primary_cta_target: string;
    hero_media_reference: RestaurantMediaReference | "";
  };
  about: {
    title: string;
    description: string;
  };
  menu: {
    section_title: string;
    categories: RestaurantCategory[];
    items: RestaurantItem[];
  };
  hours: RestaurantHours[];
  contact: {
    public_email: string;
    public_phone: string;
    whatsapp_phone: string;
    address_line: string;
    city: string;
    map_url: string;
  };
  social: {
    instagram_url: string;
    facebook_url: string;
    tiktok_url: string;
  };
  seo: {
    title: string;
    description: string;
  };
  footer: {
    legal_name: string;
    copyright_text: string;
  };
}

export interface RestaurantMediaUsage {
  assetId: string;
  altText: string;
  decorative: boolean;
}

export interface RestaurantItemV2
  extends Omit<RestaurantItem, "media_reference"> {
  media: RestaurantMediaUsage | null;
}

export interface RestaurantContentV2
  extends Omit<RestaurantContent, "hero" | "menu"> {
  hero: Omit<RestaurantContent["hero"], "hero_media_reference"> & {
    media: RestaurantMediaUsage | null;
  };
  menu: Omit<RestaurantContent["menu"], "items"> & {
    items: RestaurantItemV2[];
  };
}

export type RestaurantAnyContent = RestaurantContent | RestaurantContentV2;

export const GYM_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export const GYM_APPEARANCE_VARIANTS = ["volt", "studio", "forge"] as const;
export const GYM_HERO_LAYOUTS = ["left", "right", "stacked"] as const;
export const GYM_METHOD_LAYOUTS = ["left", "right", "stacked"] as const;
export const GYM_TITLE_SCALES = ["compact", "large", "impact"] as const;
export const GYM_MEDIA_DENSITIES = ["compact", "balanced", "immersive"] as const;
export const GYM_CLASS_COLUMNS = [2, 3, 4] as const;
export const GYM_SPACING_MODES = ["compact", "spacious", "cinematic"] as const;

export type GymDay = (typeof GYM_DAYS)[number];
export type GymAppearanceVariant = (typeof GYM_APPEARANCE_VARIANTS)[number];
export type GymHeroLayout = (typeof GYM_HERO_LAYOUTS)[number];
export type GymMethodLayout = (typeof GYM_METHOD_LAYOUTS)[number];
export type GymTitleScale = (typeof GYM_TITLE_SCALES)[number];
export type GymMediaDensity = (typeof GYM_MEDIA_DENSITIES)[number];
export type GymClassColumns = (typeof GYM_CLASS_COLUMNS)[number];
export type GymSpacingMode = (typeof GYM_SPACING_MODES)[number];
export type GymCtaChannel = "contact" | "phone" | "whatsapp" | "email";
export type GymIntensity = "low" | "moderate" | "high";
export type GymPlanPeriodicity =
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "one_time";
export type GymSocialNetwork =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "youtube";

export interface GymMediaUsage {
  assetId: string;
  altText: string;
  decorative: boolean;
}

export interface GymContentV1 {
  identity: {
    business_name: string;
    descriptor: string;
    logo: GymMediaUsage | null;
  };
  hero: {
    headline: string;
    subheadline: string;
    primary_cta_label: string;
    primary_cta_channel: GymCtaChannel;
    media: GymMediaUsage | null;
  };
  method: {
    title: string;
    description: string;
    pillars: Array<{
      id: string;
      title: string;
      description: string;
      order: number;
    }>;
  };
  class_categories: Array<{
    id: string;
    name: string;
    order: number;
  }>;
  classes: Array<{
    id: string;
    category_id: string;
    name: string;
    description: string;
    intensity: GymIntensity;
    duration_minutes: number;
    visible: boolean;
    trial_cta_visible: boolean;
    order: number;
    media: GymMediaUsage | null;
  }>;
  schedule: Array<{
    id: string;
    class_id: string;
    trainer_id: string | null;
    day: GymDay;
    start_time: string;
    duration_minutes: number;
    informational_capacity: number | null;
    visible: boolean;
    order: number;
  }>;
  trainers: Array<{
    id: string;
    name: string;
    specialty: string;
    description: string;
    visible: boolean;
    order: number;
    media: GymMediaUsage | null;
  }>;
  plans: Array<{
    id: string;
    name: string;
    price_text: string;
    periodicity: GymPlanPeriodicity;
    benefits: string[];
    featured: boolean;
    visible: boolean;
    order: number;
  }>;
  facilities: Array<{
    id: string;
    title: string;
    description: string;
    visible: boolean;
    order: number;
    media: GymMediaUsage | null;
  }>;
  gallery: Array<{
    id: string;
    visible: boolean;
    order: number;
    media: GymMediaUsage;
  }>;
  location: {
    address_line: string;
    city: string;
    directions: string;
    map_url: string;
  };
  hours: Array<{
    day: GymDay;
    is_open: boolean;
    opening_time: string;
    closing_time: string;
    note: string;
  }>;
  contact: {
    public_email: string;
    public_phone: string;
    whatsapp_phone: string;
    social: Array<{
      id: string;
      network: GymSocialNetwork;
      url: string;
      visible: boolean;
      order: number;
    }>;
  };
  seo: {
    title: string;
    description: string;
  };
  appearance: {
    variant: GymAppearanceVariant;
    hero_layout: GymHeroLayout;
    method_layout: GymMethodLayout;
    title_scale: GymTitleScale;
    media_density: GymMediaDensity;
    class_columns: GymClassColumns;
    spacing: GymSpacingMode;
  };
}

export interface ContentSchemaTypeMap {
  [RESTAURANT_SCHEMA_KEY]: RestaurantContent;
  [RESTAURANT_V2_SCHEMA_KEY]: RestaurantContentV2;
  [GYM_SCHEMA_KEY]: GymContentV1;
}

export type RegisteredContentSchemaKey = keyof ContentSchemaTypeMap;
export type RegisteredContent = ContentSchemaTypeMap[RegisteredContentSchemaKey];

export type RegisteredContentDocument = {
  [SchemaKey in RegisteredContentSchemaKey]: {
    industryKey: SchemaKey extends typeof GYM_SCHEMA_KEY ? "gym" : "restaurant";
    schemaKey: SchemaKey;
    schemaVersion: SchemaKey extends typeof RESTAURANT_V2_SCHEMA_KEY ? 2 : 1;
    content: ContentSchemaTypeMap[SchemaKey];
  };
}[RegisteredContentSchemaKey];

export interface TemplateOption {
  id: string;
  templateId: string;
  templateKey: string;
  displayName: string;
  description: string;
  industryKey: IndustryKey;
  version: number;
  rendererKey: string;
  schemaKey: string;
  minimumSchemaVersion: number;
  maximumSchemaVersion: number;
  status: "draft" | "active" | "deprecated" | "retired";
  previewKey?: string | null;
}

export interface TemplateAssignment {
  id: string;
  tenantId: string;
  siteId: string;
  templateVersionId: string;
  templateName: string;
  templateVersion: number;
  industryKey: IndustryKey;
  rendererKey: string;
  schemaKey: string;
  schemaVersion: number;
  status: "active" | "detached";
  version: number;
}

export interface ContentDraft {
  id: string;
  siteId: string;
  schemaKey: string;
  schemaVersion: number;
  content: RegisteredContent;
  revision: number;
  basedOnPublicationId: string | null;
  updatedAt: Date;
}

export interface ContentPublication {
  id: string;
  siteId: string;
  templateVersionId: string;
  templateName: string;
  templateVersion: number;
  industryKey: IndustryKey;
  schemaKey: string;
  schemaVersion: number;
  content: RegisteredContent;
  publicationNumber: number;
  publishedByName: string;
  restoredFromPublicationId: string | null;
  publishedAt: Date;
  isCurrent: boolean;
}

export interface ClientContentWorkspace {
  siteId: string;
  siteName: string;
  siteStatus: string;
  siteSlug: string;
  industryKey: IndustryKey;
  assignment: TemplateAssignment | null;
  draft: ContentDraft | null;
  publications: ContentPublication[];
}

export interface PublicSiteResolution {
  siteId: string;
  siteSlug: string;
  publicState: "published" | "preparing" | "unavailable";
  canonicalHostname: string | null;
  industryKey: IndustryKey;
  rendererKey: string | null;
  schemaKey: string | null;
  schemaVersion: number | null;
  publicationId: string | null;
  publicationNumber: number | null;
  content: RegisteredContent | null;
  media?: import("@/src/media/types").MediaRenderManifest;
}
