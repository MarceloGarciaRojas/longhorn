import { createHash } from "node:crypto";
import {
  RESTAURANT_DAYS,
  type RestaurantContentV2,
  type RestaurantDay,
  type RestaurantMediaUsage,
} from "@/src/content/types";
import { validateRestaurantV2Content } from "@/src/content/restaurant-v2-schema";
import type { RestaurantOnboardingAnswersV1 } from "./types";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9 ()-]{6,24}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const EXECUTABLE =
  /<[^>]*>|\bjavascript\s*:|\bdata\s*:\s*text|\bon\w+\s*=|&lt;\s*(?:script|iframe)/i;

export class OnboardingSchemaError extends Error {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super(`${field}:${reason}`);
    this.name = "OnboardingSchemaError";
  }
}

function object(
  value: unknown,
  field: string,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OnboardingSchemaError(field, "type");
  }
  const record = value as Record<string, unknown>;
  const extra = Object.keys(record).find((key) => !keys.includes(key));
  if (extra) throw new OnboardingSchemaError(`${field}.${extra}`, "unknown");
  return record;
}

function text(
  value: unknown,
  field: string,
  maximum: number,
  required: boolean,
): string {
  if (typeof value !== "string") throw new OnboardingSchemaError(field, "type");
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maximum) {
    throw new OnboardingSchemaError(field, "length");
  }
  if (EXECUTABLE.test(normalized)) {
    throw new OnboardingSchemaError(field, "unsafe");
  }
  return normalized;
}

function url(value: unknown, field: string): string {
  const normalized = text(value, field, 500, false);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") throw new Error("protocol");
    return parsed.toString();
  } catch {
    throw new OnboardingSchemaError(field, "url");
  }
}

function media(value: unknown, field: string): RestaurantMediaUsage | null {
  if (value === null) return null;
  const entry = object(value, field, ["assetId", "altText", "decorative"]);
  const assetId = text(entry.assetId, `${field}.assetId`, 36, true);
  const altText = text(entry.altText, `${field}.altText`, 250, false);
  if (!UUID.test(assetId) || typeof entry.decorative !== "boolean") {
    throw new OnboardingSchemaError(field, "media");
  }
  if ((entry.decorative && altText) || (!entry.decorative && !altText)) {
    throw new OnboardingSchemaError(`${field}.altText`, "alt");
  }
  return { assetId: assetId.toLowerCase(), altText, decorative: entry.decorative };
}

function integer(value: unknown, field: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new OnboardingSchemaError(field, "number");
  }
  return Number(value);
}

export function validateRestaurantOnboardingAnswers(
  input: unknown,
  mode: "draft" | "submitted",
): RestaurantOnboardingAnswersV1 {
  const required = mode === "submitted";
  const root = object(input, "answers", [
    "company", "objectives", "about", "menu", "hours", "contact",
    "social", "seo", "media",
  ]);
  const company = object(root.company, "company", [
    "businessName", "tagline", "shortDescription", "legalName",
  ]);
  const objectives = object(root.objectives, "objectives", [
    "primaryGoal", "targetAudience", "desiredTone", "primaryCallToAction",
  ]);
  const cta = object(
    objectives.primaryCallToAction,
    "objectives.primaryCallToAction",
    ["label", "type", "target"],
  );
  const about = object(root.about, "about", ["title", "description"]);
  const menu = object(root.menu, "menu", ["sectionTitle", "categories", "items"]);
  const contact = object(root.contact, "contact", [
    "publicEmail", "publicPhone", "whatsappPhone", "address", "city", "mapUrl",
  ]);
  const social = object(root.social, "social", [
    "instagram", "facebook", "tiktok",
  ]);
  const seo = object(root.seo, "seo", ["title", "description"]);
  const mediaRoot = object(root.media, "media", ["hero"]);

  if (!Array.isArray(menu.categories) || menu.categories.length > 8) {
    throw new OnboardingSchemaError("menu.categories", "count");
  }
  const categories = menu.categories.map((value, index) => {
    const entry = object(value, `menu.categories.${index}`, [
      "id", "name", "description", "order",
    ]);
    const id = text(entry.id, `menu.categories.${index}.id`, 36, true);
    if (!UUID.test(id)) throw new OnboardingSchemaError(`menu.categories.${index}.id`, "id");
    return {
      id: id.toLowerCase(),
      name: text(entry.name, `menu.categories.${index}.name`, 80, required),
      description: text(entry.description, `menu.categories.${index}.description`, 240, false),
      order: integer(entry.order, `menu.categories.${index}.order`, 100),
    };
  });
  const categoryIds = new Set(categories.map((entry) => entry.id));
  if (categoryIds.size !== categories.length) {
    throw new OnboardingSchemaError("menu.categories.id", "duplicate");
  }
  if (!Array.isArray(menu.items) || menu.items.length > 40) {
    throw new OnboardingSchemaError("menu.items", "count");
  }
  const itemIds = new Set<string>();
  const items = menu.items.map((value, index) => {
    const entry = object(value, `menu.items.${index}`, [
      "id", "categoryId", "name", "description", "priceText",
      "availability", "order", "media",
    ]);
    const id = text(entry.id, `menu.items.${index}.id`, 36, true).toLowerCase();
    const categoryId = text(
      entry.categoryId,
      `menu.items.${index}.categoryId`,
      36,
      true,
    ).toLowerCase();
    if (!UUID.test(id) || !categoryIds.has(categoryId) || itemIds.has(id)) {
      throw new OnboardingSchemaError(`menu.items.${index}.id`, "reference");
    }
    itemIds.add(id);
    if (typeof entry.availability !== "boolean") {
      throw new OnboardingSchemaError(`menu.items.${index}.availability`, "type");
    }
    return {
      id,
      categoryId,
      name: text(entry.name, `menu.items.${index}.name`, 100, required),
      description: text(entry.description, `menu.items.${index}.description`, 300, required),
      priceText: text(entry.priceText, `menu.items.${index}.priceText`, 40, false),
      availability: entry.availability,
      order: integer(entry.order, `menu.items.${index}.order`, 200),
      media: media(entry.media, `menu.items.${index}.media`),
    };
  });

  if (!Array.isArray(root.hours) || root.hours.length !== 7) {
    throw new OnboardingSchemaError("hours", "count");
  }
  const seenDays = new Set<RestaurantDay>();
  const hours = root.hours.map((value, index) => {
    const entry = object(value, `hours.${index}`, [
      "day", "isOpen", "openingTime", "closingTime", "note",
    ]);
    if (
      typeof entry.day !== "string" ||
      !RESTAURANT_DAYS.includes(entry.day as RestaurantDay) ||
      seenDays.has(entry.day as RestaurantDay) ||
      typeof entry.isOpen !== "boolean"
    ) {
      throw new OnboardingSchemaError(`hours.${index}`, "value");
    }
    seenDays.add(entry.day as RestaurantDay);
    const openingTime = text(entry.openingTime, `hours.${index}.openingTime`, 5, false);
    const closingTime = text(entry.closingTime, `hours.${index}.closingTime`, 5, false);
    if (
      (entry.isOpen && (!TIME.test(openingTime) || !TIME.test(closingTime) || openingTime >= closingTime)) ||
      (!entry.isOpen && (openingTime || closingTime))
    ) {
      throw new OnboardingSchemaError(`hours.${index}`, "time");
    }
    return {
      day: entry.day as RestaurantDay,
      isOpen: entry.isOpen,
      openingTime,
      closingTime,
      note: text(entry.note, `hours.${index}.note`, 120, false),
    };
  });

  const ctaType = String(cta.type);
  if (!["menu", "phone", "whatsapp", "map"].includes(ctaType)) {
    throw new OnboardingSchemaError("objectives.primaryCallToAction.type", "choice");
  }
  const email = text(contact.publicEmail, "contact.publicEmail", 254, required).toLowerCase();
  const publicPhone = text(contact.publicPhone, "contact.publicPhone", 25, required);
  const whatsappPhone = text(contact.whatsappPhone, "contact.whatsappPhone", 25, false);
  if ((email && !EMAIL.test(email)) || (publicPhone && !PHONE.test(publicPhone)) ||
      (whatsappPhone && !PHONE.test(whatsappPhone))) {
    throw new OnboardingSchemaError("contact", "format");
  }
  const result: RestaurantOnboardingAnswersV1 = {
    company: {
      businessName: text(company.businessName, "company.businessName", 120, required),
      tagline: text(company.tagline, "company.tagline", 100, required),
      shortDescription: text(company.shortDescription, "company.shortDescription", 280, required),
      legalName: text(company.legalName, "company.legalName", 160, false),
    },
    objectives: {
      primaryGoal: text(objectives.primaryGoal, "objectives.primaryGoal", 500, required),
      targetAudience: text(objectives.targetAudience, "objectives.targetAudience", 500, required),
      desiredTone: text(objectives.desiredTone, "objectives.desiredTone", 120, required),
      primaryCallToAction: {
        label: text(cta.label, "objectives.primaryCallToAction.label", 60, required),
        type: ctaType as "menu" | "phone" | "whatsapp" | "map",
        target: text(cta.target, "objectives.primaryCallToAction.target", 500, required),
      },
    },
    about: {
      title: text(about.title, "about.title", 120, required),
      description: text(about.description, "about.description", 1200, required),
    },
    menu: {
      sectionTitle: text(menu.sectionTitle, "menu.sectionTitle", 120, required),
      categories: categories.sort((a, b) => a.order - b.order),
      items: items.sort((a, b) => a.order - b.order),
    },
    hours: hours.sort(
      (a, b) => RESTAURANT_DAYS.indexOf(a.day) - RESTAURANT_DAYS.indexOf(b.day),
    ),
    contact: {
      publicEmail: email,
      publicPhone,
      whatsappPhone,
      address: text(contact.address, "contact.address", 200, required),
      city: text(contact.city, "contact.city", 100, required),
      mapUrl: url(contact.mapUrl, "contact.mapUrl"),
    },
    social: {
      instagram: url(social.instagram, "social.instagram"),
      facebook: url(social.facebook, "social.facebook"),
      tiktok: url(social.tiktok, "social.tiktok"),
    },
    seo: {
      title: text(seo.title, "seo.title", 70, required),
      description: text(seo.description, "seo.description", 160, required),
    },
    media: { hero: media(mediaRoot.hero, "media.hero") },
  };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 65_536) {
    throw new OnboardingSchemaError("answers", "size");
  }
  return result;
}

export function transformOnboardingToRestaurantV2(
  answers: RestaurantOnboardingAnswersV1,
  mode: "draft" | "publication" = "draft",
): RestaurantContentV2 {
  return validateRestaurantV2Content({
    identity: {
      business_name: answers.company.businessName,
      short_description: answers.company.shortDescription,
      tagline: answers.company.tagline,
    },
    hero: {
      headline: answers.company.tagline,
      subheadline: answers.company.shortDescription,
      primary_cta_label: answers.objectives.primaryCallToAction.label,
      primary_cta_type: answers.objectives.primaryCallToAction.type,
      primary_cta_target: answers.objectives.primaryCallToAction.target,
      media: answers.media.hero,
    },
    about: {
      title: answers.about.title,
      description: answers.about.description,
    },
    menu: {
      section_title: answers.menu.sectionTitle,
      categories: answers.menu.categories.map((entry) => ({
        id: entry.id,
        name: entry.name,
        description: entry.description,
        order: entry.order,
      })),
      items: answers.menu.items.map((entry) => ({
        id: entry.id,
        category_id: entry.categoryId,
        name: entry.name,
        description: entry.description,
        price_text: entry.priceText,
        availability: entry.availability,
        order: entry.order,
        media: entry.media,
      })),
    },
    hours: answers.hours.map((entry) => ({
      day: entry.day,
      is_open: entry.isOpen,
      opening_time: entry.openingTime,
      closing_time: entry.closingTime,
      note: entry.note,
    })),
    contact: {
      public_email: answers.contact.publicEmail,
      public_phone: answers.contact.publicPhone,
      whatsapp_phone: answers.contact.whatsappPhone,
      address_line: answers.contact.address,
      city: answers.contact.city,
      map_url: answers.contact.mapUrl,
    },
    social: {
      instagram_url: answers.social.instagram,
      facebook_url: answers.social.facebook,
      tiktok_url: answers.social.tiktok,
    },
    seo: {
      title: answers.seo.title,
      description: answers.seo.description,
    },
    footer: {
      legal_name: answers.company.legalName,
      copyright_text: answers.company.businessName,
    },
  }, mode);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }
  return value;
}

export function onboardingContentChecksum(input: Readonly<{
  siteId: string;
  draftRevision: number;
  templateVersionId: string;
  schemaKey: string;
  schemaVersion: number;
  content: RestaurantContentV2;
}>): string {
  return createHash("sha256")
    .update(JSON.stringify(stable(input)), "utf8")
    .digest("hex");
}

export function emptyRestaurantOnboardingAnswers(
  input: Readonly<{
    businessName: string;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
  }>,
): RestaurantOnboardingAnswersV1 {
  return validateRestaurantOnboardingAnswers({
    company: {
      businessName: input.businessName,
      tagline: "",
      shortDescription: "",
      legalName: "",
    },
    objectives: {
      primaryGoal: "",
      targetAudience: "",
      desiredTone: "",
      primaryCallToAction: {
        label: "",
        type: "menu",
        target: "",
      },
    },
    about: { title: "", description: "" },
    menu: { sectionTitle: "Nuestra carta", categories: [], items: [] },
    hours: RESTAURANT_DAYS.map((day) => ({
      day,
      isOpen: false,
      openingTime: "",
      closingTime: "",
      note: "",
    })),
    contact: {
      publicEmail: input.email ?? "",
      publicPhone: input.phone ?? "",
      whatsappPhone: "",
      address: "",
      city: input.city ?? "",
      mapUrl: "",
    },
    social: { instagram: "", facebook: "", tiktok: "" },
    seo: { title: "", description: "" },
    media: { hero: null },
  }, "draft");
}
