import {
  RESTAURANT_DAYS,
  RESTAURANT_MEDIA_REFERENCES,
  type RestaurantContent,
  type RestaurantCtaType,
  type RestaurantMediaReference,
} from "./types";

export const RESTAURANT_CONTENT_MAX_BYTES = 65_536;
export const RESTAURANT_MAX_CATEGORIES = 8;
export const RESTAURANT_MAX_ITEMS = 40;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9 ()-]{6,24}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const EXECUTABLE =
  /<[^>]*>|\bjavascript\s*:|\bdata\s*:\s*text|\bon\w+\s*=|&lt;\s*(?:script|iframe)/i;

export class RestaurantContentValidationError extends Error {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super(`${field}:${reason}`);
    this.name = "RestaurantContentValidationError";
  }
}

type RecordValue = Record<string, unknown>;

function object(
  value: unknown,
  field: string,
  keys: readonly string[],
): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RestaurantContentValidationError(field, "type");
  }
  const record = value as RecordValue;
  const extras = Object.keys(record).filter((key) => !keys.includes(key));
  if (extras.length) {
    throw new RestaurantContentValidationError(`${field}.${extras[0]}`, "unknown");
  }
  return record;
}

function stringValue(
  value: unknown,
  field: string,
  maximum: number,
  required: boolean,
): string {
  if (typeof value !== "string") {
    throw new RestaurantContentValidationError(field, "type");
  }
  const result = value.trim();
  if ((required && result.length === 0) || result.length > maximum) {
    throw new RestaurantContentValidationError(field, "length");
  }
  if (EXECUTABLE.test(result)) {
    throw new RestaurantContentValidationError(field, "unsafe");
  }
  return result;
}

function enumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new RestaurantContentValidationError(field, "choice");
  }
  return value as T;
}

function integer(value: unknown, field: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new RestaurantContentValidationError(field, "number");
  }
  return Number(value);
}

function optionalUrl(value: unknown, field: string): string {
  const result = stringValue(value, field, 500, false);
  if (!result) return "";
  let parsed: URL;
  try {
    parsed = new URL(result);
  } catch {
    throw new RestaurantContentValidationError(field, "url");
  }
  if (parsed.protocol !== "https:") {
    throw new RestaurantContentValidationError(field, "protocol");
  }
  return parsed.toString();
}

function phone(value: unknown, field: string, required: boolean): string {
  const result = stringValue(value, field, 25, required);
  if (result && !PHONE.test(result)) {
    throw new RestaurantContentValidationError(field, "phone");
  }
  return result;
}

function email(value: unknown, field: string, required: boolean): string {
  const result = stringValue(value, field, 254, required).toLowerCase();
  if (result && !EMAIL.test(result)) {
    throw new RestaurantContentValidationError(field, "email");
  }
  return result;
}

function media(value: unknown, field: string): RestaurantMediaReference | "" {
  if (value === "") return "";
  return enumValue(value, field, RESTAURANT_MEDIA_REFERENCES);
}

function assertUnique(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) {
    throw new RestaurantContentValidationError(field, "duplicate");
  }
}

function validateCtaTarget(
  type: RestaurantCtaType,
  target: string,
  required: boolean,
): string {
  if (!target && !required) return "";
  if (type === "menu" && target === "#menu") return target;
  if (type === "phone" || type === "whatsapp") {
    return phone(target, "hero.primary_cta_target", required);
  }
  if (type === "map") return optionalUrl(target, "hero.primary_cta_target");
  throw new RestaurantContentValidationError("hero.primary_cta_target", "target");
}

export function validateRestaurantContent(
  input: unknown,
  mode: "draft" | "publication",
): RestaurantContent {
  const required = mode === "publication";
  const root = object(input, "content", [
    "identity", "hero", "about", "menu", "hours", "contact", "social", "seo", "footer",
  ]);
  const identity = object(root.identity, "identity", [
    "business_name", "short_description", "tagline",
  ]);
  const hero = object(root.hero, "hero", [
    "headline", "subheadline", "primary_cta_label", "primary_cta_type",
    "primary_cta_target", "hero_media_reference",
  ]);
  const about = object(root.about, "about", ["title", "description"]);
  const menu = object(root.menu, "menu", ["section_title", "categories", "items"]);
  const contact = object(root.contact, "contact", [
    "public_email", "public_phone", "whatsapp_phone", "address_line", "city", "map_url",
  ]);
  const social = object(root.social, "social", [
    "instagram_url", "facebook_url", "tiktok_url",
  ]);
  const seo = object(root.seo, "seo", ["title", "description"]);
  const footer = object(root.footer, "footer", ["legal_name", "copyright_text"]);

  if (!Array.isArray(menu.categories) ||
      menu.categories.length > RESTAURANT_MAX_CATEGORIES ||
      (required && menu.categories.length === 0)) {
    throw new RestaurantContentValidationError("menu.categories", "count");
  }
  const categories = menu.categories.map((entry, index) => {
    const category = object(entry, `menu.categories.${index}`, [
      "id", "name", "description", "order",
    ]);
    const id = stringValue(category.id, `menu.categories.${index}.id`, 36, true);
    if (!UUID.test(id)) {
      throw new RestaurantContentValidationError(`menu.categories.${index}.id`, "id");
    }
    return {
      id,
      name: stringValue(category.name, `menu.categories.${index}.name`, 80, required),
      description: stringValue(
        category.description,
        `menu.categories.${index}.description`,
        240,
        false,
      ),
      order: integer(category.order, `menu.categories.${index}.order`, 100),
    };
  });
  assertUnique(categories.map((category) => category.id), "menu.categories.id");
  assertUnique(categories.map((category) => String(category.order)), "menu.categories.order");

  if (!Array.isArray(menu.items) ||
      menu.items.length > RESTAURANT_MAX_ITEMS ||
      (required && menu.items.length === 0)) {
    throw new RestaurantContentValidationError("menu.items", "count");
  }
  const categoryIds = new Set(categories.map((category) => category.id));
  const items = menu.items.map((entry, index) => {
    const item = object(entry, `menu.items.${index}`, [
      "id", "category_id", "name", "description", "price_text",
      "availability", "order", "media_reference",
    ]);
    const id = stringValue(item.id, `menu.items.${index}.id`, 36, true);
    const categoryId = stringValue(
      item.category_id,
      `menu.items.${index}.category_id`,
      36,
      true,
    );
    if (!UUID.test(id) || !UUID.test(categoryId) || !categoryIds.has(categoryId)) {
      throw new RestaurantContentValidationError(`menu.items.${index}.id`, "reference");
    }
    if (typeof item.availability !== "boolean") {
      throw new RestaurantContentValidationError(
        `menu.items.${index}.availability`,
        "type",
      );
    }
    return {
      id,
      category_id: categoryId,
      name: stringValue(item.name, `menu.items.${index}.name`, 100, required),
      description: stringValue(
        item.description,
        `menu.items.${index}.description`,
        300,
        required,
      ),
      price_text: stringValue(
        item.price_text,
        `menu.items.${index}.price_text`,
        40,
        false,
      ),
      availability: item.availability,
      order: integer(item.order, `menu.items.${index}.order`, 200),
      media_reference: media(
        item.media_reference,
        `menu.items.${index}.media_reference`,
      ),
    };
  });
  assertUnique(items.map((item) => item.id), "menu.items.id");
  for (const category of categories) {
    assertUnique(
      items.filter((item) => item.category_id === category.id)
        .map((item) => String(item.order)),
      `menu.items.${category.id}.order`,
    );
  }

  if (!Array.isArray(root.hours) || root.hours.length !== RESTAURANT_DAYS.length) {
    throw new RestaurantContentValidationError("hours", "count");
  }
  const hours = root.hours.map((entry, index) => {
    const schedule = object(entry, `hours.${index}`, [
      "day", "is_open", "opening_time", "closing_time", "note",
    ]);
    const day = enumValue(schedule.day, `hours.${index}.day`, RESTAURANT_DAYS);
    if (typeof schedule.is_open !== "boolean") {
      throw new RestaurantContentValidationError(`hours.${index}.is_open`, "type");
    }
    const opening = stringValue(schedule.opening_time, `hours.${index}.opening_time`, 5, false);
    const closing = stringValue(schedule.closing_time, `hours.${index}.closing_time`, 5, false);
    if (schedule.is_open && (!TIME.test(opening) || !TIME.test(closing) || opening >= closing)) {
      throw new RestaurantContentValidationError(`hours.${index}`, "time");
    }
    if (!schedule.is_open && (opening || closing)) {
      throw new RestaurantContentValidationError(`hours.${index}`, "closed");
    }
    return {
      day,
      is_open: schedule.is_open,
      opening_time: opening,
      closing_time: closing,
      note: stringValue(schedule.note, `hours.${index}.note`, 120, false),
    };
  });
  assertUnique(hours.map((schedule) => schedule.day), "hours.day");
  if (RESTAURANT_DAYS.some((day) => !hours.some((schedule) => schedule.day === day))) {
    throw new RestaurantContentValidationError("hours.day", "missing");
  }

  const ctaType = enumValue(
    hero.primary_cta_type,
    "hero.primary_cta_type",
    ["menu", "phone", "whatsapp", "map"] as const,
  );
  const normalized: RestaurantContent = {
    identity: {
      business_name: stringValue(identity.business_name, "identity.business_name", 120, required),
      short_description: stringValue(identity.short_description, "identity.short_description", 280, required),
      tagline: stringValue(identity.tagline, "identity.tagline", 100, required),
    },
    hero: {
      headline: stringValue(hero.headline, "hero.headline", 140, required),
      subheadline: stringValue(hero.subheadline, "hero.subheadline", 320, required),
      primary_cta_label: stringValue(hero.primary_cta_label, "hero.primary_cta_label", 60, required),
      primary_cta_type: ctaType,
      primary_cta_target: validateCtaTarget(
        ctaType,
        stringValue(hero.primary_cta_target, "hero.primary_cta_target", 500, required),
        required,
      ),
      hero_media_reference: media(hero.hero_media_reference, "hero.hero_media_reference"),
    },
    about: {
      title: stringValue(about.title, "about.title", 120, required),
      description: stringValue(about.description, "about.description", 1200, required),
    },
    menu: {
      section_title: stringValue(menu.section_title, "menu.section_title", 120, required),
      categories: categories.sort((a, b) => a.order - b.order),
      items: items.sort((a, b) => a.order - b.order),
    },
    hours: hours.sort(
      (a, b) => RESTAURANT_DAYS.indexOf(a.day) - RESTAURANT_DAYS.indexOf(b.day),
    ),
    contact: {
      public_email: email(contact.public_email, "contact.public_email", required),
      public_phone: phone(contact.public_phone, "contact.public_phone", required),
      whatsapp_phone: phone(contact.whatsapp_phone, "contact.whatsapp_phone", false),
      address_line: stringValue(contact.address_line, "contact.address_line", 200, required),
      city: stringValue(contact.city, "contact.city", 100, required),
      map_url: optionalUrl(contact.map_url, "contact.map_url"),
    },
    social: {
      instagram_url: optionalUrl(social.instagram_url, "social.instagram_url"),
      facebook_url: optionalUrl(social.facebook_url, "social.facebook_url"),
      tiktok_url: optionalUrl(social.tiktok_url, "social.tiktok_url"),
    },
    seo: {
      title: stringValue(seo.title, "seo.title", 70, required),
      description: stringValue(seo.description, "seo.description", 160, required),
    },
    footer: {
      legal_name: stringValue(footer.legal_name, "footer.legal_name", 160, false),
      copyright_text: stringValue(footer.copyright_text, "footer.copyright_text", 200, false),
    },
  };
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > RESTAURANT_CONTENT_MAX_BYTES) {
    throw new RestaurantContentValidationError("content", "size");
  }
  return normalized;
}

export function parseRestaurantContent(
  serialized: string,
  mode: "draft" | "publication",
): RestaurantContent {
  if (Buffer.byteLength(serialized, "utf8") > RESTAURANT_CONTENT_MAX_BYTES) {
    throw new RestaurantContentValidationError("content", "size");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new RestaurantContentValidationError("content", "json");
  }
  return validateRestaurantContent(parsed, mode);
}

export function emptyRestaurantContent(input: {
  businessName: string;
  description?: string | null;
  email?: string | null;
  phone?: string | null;
  legalName?: string | null;
}): RestaurantContent {
  return validateRestaurantContent({
    identity: {
      business_name: input.businessName,
      short_description: input.description ?? "",
      tagline: "",
    },
    hero: {
      headline: "",
      subheadline: "",
      primary_cta_label: "",
      primary_cta_type: "menu",
      primary_cta_target: "",
      hero_media_reference: "placeholder",
    },
    about: { title: "", description: input.description ?? "" },
    menu: { section_title: "", categories: [], items: [] },
    hours: RESTAURANT_DAYS.map((day) => ({
      day,
      is_open: false,
      opening_time: "",
      closing_time: "",
      note: "",
    })),
    contact: {
      public_email: input.email ?? "",
      public_phone: input.phone ?? "",
      whatsapp_phone: "",
      address_line: "",
      city: "",
      map_url: "",
    },
    social: { instagram_url: "", facebook_url: "", tiktok_url: "" },
    seo: { title: "", description: "" },
    footer: { legal_name: input.legalName ?? "", copyright_text: "" },
  }, "draft");
}
