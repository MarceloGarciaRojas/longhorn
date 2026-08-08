export const RESTAURANT_SCHEMA_KEY = "restaurant.v1";
export const RESTAURANT_SCHEMA_VERSION = 1;
export const RESTAURANT_RENDERER_KEY = "restaurant-classic-v1";
export const RESTAURANT_V2_SCHEMA_KEY = "restaurant.v2";
export const RESTAURANT_V2_SCHEMA_VERSION = 2;
export const RESTAURANT_CLASSIC_V2_RENDERER_KEY = "restaurant-classic-v2";
export const RESTAURANT_MODERN_RENDERER_KEY = "restaurant-modern-v1";
export const RESTAURANT_EDITORIAL_RENDERER_KEY = "restaurant-editorial-v1";
export const RESTAURANT_EDITORIAL_TEMPLATE_KEY = "restaurant-editorial";

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

export interface TemplateOption {
  id: string;
  templateId: string;
  templateKey: string;
  displayName: string;
  description: string;
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
  content: RestaurantAnyContent;
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
  schemaKey: string;
  schemaVersion: number;
  content: RestaurantAnyContent;
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
  assignment: TemplateAssignment | null;
  draft: ContentDraft | null;
  publications: ContentPublication[];
}

export interface PublicSiteResolution {
  siteId: string;
  siteSlug: string;
  publicState: "published" | "preparing" | "unavailable";
  canonicalHostname: string | null;
  rendererKey: string | null;
  schemaKey: string | null;
  schemaVersion: number | null;
  publicationId: string | null;
  publicationNumber: number | null;
  content: RestaurantAnyContent | null;
  media?: import("@/src/media/types").MediaRenderManifest;
}
