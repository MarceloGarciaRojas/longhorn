import { createHash } from "node:crypto";
import {
  GYM_APPEARANCE_VARIANTS,
  GYM_CLASS_COLUMNS,
  GYM_DAYS,
  GYM_HERO_LAYOUTS,
  GYM_MEDIA_DENSITIES,
  GYM_METHOD_LAYOUTS,
  GYM_SPACING_MODES,
  GYM_TITLE_SCALES,
  type GymContentV1,
  type GymMediaUsage,
} from "./types";

export const GYM_CONTENT_MAX_BYTES = 65_536;
export const GYM_MAX_CLASSES = 40;
export const GYM_MAX_SCHEDULE_ENTRIES = 120;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9 ()-]{6,24}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const EXECUTABLE =
  /<[^>]*>|\bjavascript\s*:|\bdata\s*:\s*text|\bon\w+\s*=|&lt;\s*(?:script|iframe)/i;

type RecordValue = Record<string, unknown>;
type ValidationMode = "draft" | "publication";

export interface GymMediaReference {
  fieldPath: string;
  assetId: string;
  altText: string;
  decorative: boolean;
}

export class GymContentValidationError extends Error {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super(`${field}:${reason}`);
    this.name = "GymContentValidationError";
  }
}

function object(
  value: unknown,
  field: string,
  keys: readonly string[],
): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GymContentValidationError(field, "type");
  }
  const record = value as RecordValue;
  const extra = Object.keys(record).find((key) => !keys.includes(key));
  if (extra) throw new GymContentValidationError(`${field}.${extra}`, "unknown");
  return record;
}

function text(
  value: unknown,
  field: string,
  maximum: number,
  required: boolean,
): string {
  if (typeof value !== "string") {
    throw new GymContentValidationError(field, "type");
  }
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maximum) {
    throw new GymContentValidationError(field, "length");
  }
  if (EXECUTABLE.test(normalized)) {
    throw new GymContentValidationError(field, "unsafe");
  }
  return normalized;
}

function choice<T extends string | number>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (!allowed.includes(value as T)) {
    throw new GymContentValidationError(field, "choice");
  }
  return value as T;
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new GymContentValidationError(field, "type");
  }
  return value;
}

function integer(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    throw new GymContentValidationError(field, "number");
  }
  return Number(value);
}

function nullableInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | null {
  return value === null ? null : integer(value, field, minimum, maximum);
}

function id(value: unknown, field: string): string {
  const normalized = text(value, field, 36, true).toLowerCase();
  if (!UUID.test(normalized)) throw new GymContentValidationError(field, "id");
  return normalized;
}

function nullableId(value: unknown, field: string): string | null {
  return value === null ? null : id(value, field);
}

function optionalUrl(value: unknown, field: string): string {
  const normalized = text(value, field, 500, false);
  if (!normalized) return "";
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new GymContentValidationError(field, "url");
  }
  if (parsed.protocol !== "https:") {
    throw new GymContentValidationError(field, "protocol");
  }
  return parsed.toString();
}

function phone(value: unknown, field: string, required: boolean): string {
  const normalized = text(value, field, 25, required);
  if (normalized && !PHONE.test(normalized)) {
    throw new GymContentValidationError(field, "phone");
  }
  return normalized;
}

function email(value: unknown, field: string, required: boolean): string {
  const normalized = text(value, field, 254, required).toLowerCase();
  if (normalized && !EMAIL.test(normalized)) {
    throw new GymContentValidationError(field, "email");
  }
  return normalized;
}

function media(value: unknown, field: string): GymMediaUsage | null {
  if (value === null) return null;
  const usage = object(value, field, ["assetId", "altText", "decorative"]);
  const decorative = booleanValue(usage.decorative, `${field}.decorative`);
  const altText = text(usage.altText, `${field}.altText`, 250, !decorative);
  if (decorative && altText) {
    throw new GymContentValidationError(`${field}.altText`, "decorative");
  }
  return {
    assetId: id(usage.assetId, `${field}.assetId`),
    altText,
    decorative,
  };
}

function requiredMedia(value: unknown, field: string): GymMediaUsage {
  const result = media(value, field);
  if (!result) throw new GymContentValidationError(field, "required");
  return result;
}

function array(
  value: unknown,
  field: string,
  maximum: number,
  required: boolean,
): unknown[] {
  if (!Array.isArray(value) || value.length > maximum || (required && !value.length)) {
    throw new GymContentValidationError(field, "count");
  }
  return value;
}

function unique(values: readonly (string | number)[], field: string): void {
  if (new Set(values).size !== values.length) {
    throw new GymContentValidationError(field, "duplicate");
  }
}

function order(value: unknown, field: string): number {
  return integer(value, field, 0, 1_000);
}

export function validateGymV1Content(
  input: unknown,
  mode: ValidationMode,
): GymContentV1 {
  const required = mode === "publication";
  const root = object(input, "content", [
    "identity", "hero", "method", "class_categories", "classes", "schedule",
    "trainers", "plans", "facilities", "gallery", "location", "hours",
    "contact", "seo", "appearance",
  ]);
  const identity = object(root.identity, "identity", [
    "business_name", "descriptor", "logo",
  ]);
  const hero = object(root.hero, "hero", [
    "headline", "subheadline", "primary_cta_label", "primary_cta_channel", "media",
  ]);
  const method = object(root.method, "method", ["title", "description", "pillars"]);
  const location = object(root.location, "location", [
    "address_line", "city", "directions", "map_url",
  ]);
  const contact = object(root.contact, "contact", [
    "public_email", "public_phone", "whatsapp_phone", "social",
  ]);
  const seo = object(root.seo, "seo", ["title", "description"]);
  const appearance = object(root.appearance, "appearance", [
    "variant", "hero_layout", "method_layout", "title_scale", "media_density",
    "class_columns", "spacing",
  ]);

  const pillars = array(method.pillars, "method.pillars", 6, required).map(
    (entry, index) => {
      const item = object(entry, `method.pillars.${index}`, [
        "id", "title", "description", "order",
      ]);
      return {
        id: id(item.id, `method.pillars.${index}.id`),
        title: text(item.title, `method.pillars.${index}.title`, 80, required),
        description: text(
          item.description,
          `method.pillars.${index}.description`,
          300,
          required,
        ),
        order: order(item.order, `method.pillars.${index}.order`),
      };
    },
  );
  unique(pillars.map((entry) => entry.id), "method.pillars.id");
  unique(pillars.map((entry) => entry.order), "method.pillars.order");

  const categories = array(
    root.class_categories,
    "class_categories",
    12,
    required,
  ).map((entry, index) => {
    const item = object(entry, `class_categories.${index}`, ["id", "name", "order"]);
    return {
      id: id(item.id, `class_categories.${index}.id`),
      name: text(item.name, `class_categories.${index}.name`, 80, required),
      order: order(item.order, `class_categories.${index}.order`),
    };
  });
  unique(categories.map((entry) => entry.id), "class_categories.id");
  unique(categories.map((entry) => entry.order), "class_categories.order");
  const categoryIds = new Set(categories.map((entry) => entry.id));

  const classes = array(
    root.classes,
    "classes",
    GYM_MAX_CLASSES,
    required,
  ).map((entry, index) => {
    const item = object(entry, `classes.${index}`, [
      "id", "category_id", "name", "description", "intensity",
      "duration_minutes", "visible", "trial_cta_visible", "order", "media",
    ]);
    const categoryId = id(item.category_id, `classes.${index}.category_id`);
    if (!categoryIds.has(categoryId)) {
      throw new GymContentValidationError(`classes.${index}.category_id`, "reference");
    }
    return {
      id: id(item.id, `classes.${index}.id`),
      category_id: categoryId,
      name: text(item.name, `classes.${index}.name`, 100, required),
      description: text(item.description, `classes.${index}.description`, 500, required),
      intensity: choice(
        item.intensity,
        `classes.${index}.intensity`,
        ["low", "moderate", "high"] as const,
      ),
      duration_minutes: integer(
        item.duration_minutes,
        `classes.${index}.duration_minutes`,
        15,
        240,
      ),
      visible: booleanValue(item.visible, `classes.${index}.visible`),
      trial_cta_visible: booleanValue(
        item.trial_cta_visible,
        `classes.${index}.trial_cta_visible`,
      ),
      order: order(item.order, `classes.${index}.order`),
      media: media(item.media, `classes.${index}.media`),
    };
  });
  unique(classes.map((entry) => entry.id), "classes.id");
  unique(classes.map((entry) => entry.order), "classes.order");
  const classIds = new Set(classes.map((entry) => entry.id));

  const trainers = array(root.trainers, "trainers", 30, false).map((entry, index) => {
    const item = object(entry, `trainers.${index}`, [
      "id", "name", "specialty", "description", "visible", "order", "media",
    ]);
    return {
      id: id(item.id, `trainers.${index}.id`),
      name: text(item.name, `trainers.${index}.name`, 100, required),
      specialty: text(item.specialty, `trainers.${index}.specialty`, 120, false),
      description: text(item.description, `trainers.${index}.description`, 500, false),
      visible: booleanValue(item.visible, `trainers.${index}.visible`),
      order: order(item.order, `trainers.${index}.order`),
      media: media(item.media, `trainers.${index}.media`),
    };
  });
  unique(trainers.map((entry) => entry.id), "trainers.id");
  unique(trainers.map((entry) => entry.order), "trainers.order");
  const trainerIds = new Set(trainers.map((entry) => entry.id));

  const schedule = array(
    root.schedule,
    "schedule",
    GYM_MAX_SCHEDULE_ENTRIES,
    required,
  ).map((entry, index) => {
    const item = object(entry, `schedule.${index}`, [
      "id", "class_id", "trainer_id", "day", "start_time", "duration_minutes",
      "informational_capacity", "visible", "order",
    ]);
    const classId = id(item.class_id, `schedule.${index}.class_id`);
    const trainerId = nullableId(item.trainer_id, `schedule.${index}.trainer_id`);
    if (!classIds.has(classId)) {
      throw new GymContentValidationError(`schedule.${index}.class_id`, "reference");
    }
    if (trainerId && !trainerIds.has(trainerId)) {
      throw new GymContentValidationError(`schedule.${index}.trainer_id`, "reference");
    }
    const startTime = text(item.start_time, `schedule.${index}.start_time`, 5, true);
    if (!TIME.test(startTime)) {
      throw new GymContentValidationError(`schedule.${index}.start_time`, "time");
    }
    return {
      id: id(item.id, `schedule.${index}.id`),
      class_id: classId,
      trainer_id: trainerId,
      day: choice(item.day, `schedule.${index}.day`, GYM_DAYS),
      start_time: startTime,
      duration_minutes: integer(
        item.duration_minutes,
        `schedule.${index}.duration_minutes`,
        15,
        240,
      ),
      informational_capacity: nullableInteger(
        item.informational_capacity,
        `schedule.${index}.informational_capacity`,
        1,
        1_000,
      ),
      visible: booleanValue(item.visible, `schedule.${index}.visible`),
      order: order(item.order, `schedule.${index}.order`),
    };
  });
  unique(schedule.map((entry) => entry.id), "schedule.id");
  unique(schedule.map((entry) => entry.order), "schedule.order");

  const plans = array(root.plans, "plans", 12, required).map((entry, index) => {
    const item = object(entry, `plans.${index}`, [
      "id", "name", "price_text", "periodicity", "benefits", "featured",
      "visible", "order",
    ]);
    const benefits = array(item.benefits, `plans.${index}.benefits`, 12, required)
      .map((benefit, benefitIndex) =>
        text(benefit, `plans.${index}.benefits.${benefitIndex}`, 160, required)
      );
    unique(benefits, `plans.${index}.benefits`);
    return {
      id: id(item.id, `plans.${index}.id`),
      name: text(item.name, `plans.${index}.name`, 100, required),
      price_text: text(item.price_text, `plans.${index}.price_text`, 60, false),
      periodicity: choice(
        item.periodicity,
        `plans.${index}.periodicity`,
        ["monthly", "quarterly", "semiannual", "annual", "one_time"] as const,
      ),
      benefits,
      featured: booleanValue(item.featured, `plans.${index}.featured`),
      visible: booleanValue(item.visible, `plans.${index}.visible`),
      order: order(item.order, `plans.${index}.order`),
    };
  });
  unique(plans.map((entry) => entry.id), "plans.id");
  unique(plans.map((entry) => entry.order), "plans.order");

  const facilities = array(root.facilities, "facilities", 20, false).map(
    (entry, index) => {
      const item = object(entry, `facilities.${index}`, [
        "id", "title", "description", "visible", "order", "media",
      ]);
      return {
        id: id(item.id, `facilities.${index}.id`),
        title: text(item.title, `facilities.${index}.title`, 100, required),
        description: text(item.description, `facilities.${index}.description`, 400, false),
        visible: booleanValue(item.visible, `facilities.${index}.visible`),
        order: order(item.order, `facilities.${index}.order`),
        media: media(item.media, `facilities.${index}.media`),
      };
    },
  );
  unique(facilities.map((entry) => entry.id), "facilities.id");
  unique(facilities.map((entry) => entry.order), "facilities.order");

  const gallery = array(root.gallery, "gallery", 30, false).map((entry, index) => {
    const item = object(entry, `gallery.${index}`, ["id", "visible", "order", "media"]);
    return {
      id: id(item.id, `gallery.${index}.id`),
      visible: booleanValue(item.visible, `gallery.${index}.visible`),
      order: order(item.order, `gallery.${index}.order`),
      media: requiredMedia(item.media, `gallery.${index}.media`),
    };
  });
  unique(gallery.map((entry) => entry.id), "gallery.id");
  unique(gallery.map((entry) => entry.order), "gallery.order");

  const hours = array(root.hours, "hours", GYM_DAYS.length, required).map(
    (entry, index) => {
      const item = object(entry, `hours.${index}`, [
        "day", "is_open", "opening_time", "closing_time", "note",
      ]);
      const isOpen = booleanValue(item.is_open, `hours.${index}.is_open`);
      const opening = text(item.opening_time, `hours.${index}.opening_time`, 5, false);
      const closing = text(item.closing_time, `hours.${index}.closing_time`, 5, false);
      if (isOpen && (!TIME.test(opening) || !TIME.test(closing) || opening >= closing)) {
        throw new GymContentValidationError(`hours.${index}`, "time");
      }
      if (!isOpen && (opening || closing)) {
        throw new GymContentValidationError(`hours.${index}`, "closed");
      }
      return {
        day: choice(item.day, `hours.${index}.day`, GYM_DAYS),
        is_open: isOpen,
        opening_time: opening,
        closing_time: closing,
        note: text(item.note, `hours.${index}.note`, 120, false),
      };
    },
  );
  unique(hours.map((entry) => entry.day), "hours.day");

  const social = array(contact.social, "contact.social", 4, false).map(
    (entry, index) => {
      const item = object(entry, `contact.social.${index}`, [
        "id", "network", "url", "visible", "order",
      ]);
      return {
        id: id(item.id, `contact.social.${index}.id`),
        network: choice(
          item.network,
          `contact.social.${index}.network`,
          ["instagram", "facebook", "tiktok", "youtube"] as const,
        ),
        url: optionalUrl(item.url, `contact.social.${index}.url`),
        visible: booleanValue(item.visible, `contact.social.${index}.visible`),
        order: order(item.order, `contact.social.${index}.order`),
      };
    },
  );
  unique(social.map((entry) => entry.id), "contact.social.id");
  unique(social.map((entry) => entry.network), "contact.social.network");
  unique(social.map((entry) => entry.order), "contact.social.order");

  const result: GymContentV1 = {
    identity: {
      business_name: text(identity.business_name, "identity.business_name", 120, required),
      descriptor: text(identity.descriptor, "identity.descriptor", 180, required),
      logo: media(identity.logo, "identity.logo"),
    },
    hero: {
      headline: text(hero.headline, "hero.headline", 140, required),
      subheadline: text(hero.subheadline, "hero.subheadline", 320, required),
      primary_cta_label: text(hero.primary_cta_label, "hero.primary_cta_label", 60, required),
      primary_cta_channel: choice(
        hero.primary_cta_channel,
        "hero.primary_cta_channel",
        ["contact", "phone", "whatsapp", "email"] as const,
      ),
      media: media(hero.media, "hero.media"),
    },
    method: {
      title: text(method.title, "method.title", 120, required),
      description: text(method.description, "method.description", 1_200, required),
      pillars: pillars.sort((left, right) => left.order - right.order),
    },
    class_categories: categories.sort((left, right) => left.order - right.order),
    classes: classes.sort((left, right) => left.order - right.order),
    schedule: schedule.sort((left, right) =>
      GYM_DAYS.indexOf(left.day) - GYM_DAYS.indexOf(right.day) ||
      left.start_time.localeCompare(right.start_time) ||
      left.order - right.order
    ),
    trainers: trainers.sort((left, right) => left.order - right.order),
    plans: plans.sort((left, right) => left.order - right.order),
    facilities: facilities.sort((left, right) => left.order - right.order),
    gallery: gallery.sort((left, right) => left.order - right.order),
    location: {
      address_line: text(location.address_line, "location.address_line", 200, required),
      city: text(location.city, "location.city", 100, required),
      directions: text(location.directions, "location.directions", 500, false),
      map_url: optionalUrl(location.map_url, "location.map_url"),
    },
    hours: hours.sort(
      (left, right) => GYM_DAYS.indexOf(left.day) - GYM_DAYS.indexOf(right.day),
    ),
    contact: {
      public_email: email(contact.public_email, "contact.public_email", required),
      public_phone: phone(contact.public_phone, "contact.public_phone", required),
      whatsapp_phone: phone(contact.whatsapp_phone, "contact.whatsapp_phone", false),
      social: social.sort((left, right) => left.order - right.order),
    },
    seo: {
      title: text(seo.title, "seo.title", 70, required),
      description: text(seo.description, "seo.description", 160, required),
    },
    appearance: {
      variant: choice(appearance.variant, "appearance.variant", GYM_APPEARANCE_VARIANTS),
      hero_layout: choice(appearance.hero_layout, "appearance.hero_layout", GYM_HERO_LAYOUTS),
      method_layout: choice(
        appearance.method_layout,
        "appearance.method_layout",
        GYM_METHOD_LAYOUTS,
      ),
      title_scale: choice(appearance.title_scale, "appearance.title_scale", GYM_TITLE_SCALES),
      media_density: choice(
        appearance.media_density,
        "appearance.media_density",
        GYM_MEDIA_DENSITIES,
      ),
      class_columns: choice(
        appearance.class_columns,
        "appearance.class_columns",
        GYM_CLASS_COLUMNS,
      ),
      spacing: choice(appearance.spacing, "appearance.spacing", GYM_SPACING_MODES),
    },
  };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > GYM_CONTENT_MAX_BYTES) {
    throw new GymContentValidationError("content", "size");
  }
  return result;
}

export function parseGymV1Content(
  serialized: string,
  mode: ValidationMode,
): GymContentV1 {
  if (Buffer.byteLength(serialized, "utf8") > GYM_CONTENT_MAX_BYTES) {
    throw new GymContentValidationError("content", "size");
  }
  try {
    return validateGymV1Content(JSON.parse(serialized), mode);
  } catch (error) {
    if (error instanceof GymContentValidationError) throw error;
    throw new GymContentValidationError("content", "json");
  }
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

export function gymV1ContentChecksum(content: GymContentV1): string {
  return createHash("sha256")
    .update(JSON.stringify(stable(content)), "utf8")
    .digest("hex");
}

export function gymV1MediaReferences(
  content: GymContentV1,
): GymMediaReference[] {
  const references: GymMediaReference[] = [];
  const append = (fieldPath: string, usage: GymMediaUsage | null): void => {
    if (usage) references.push({ fieldPath, ...usage });
  };
  append("identity.logo", content.identity.logo);
  append("hero.media", content.hero.media);
  content.classes.forEach((entry, index) =>
    append(`classes.${index}.media`, entry.media)
  );
  content.trainers.forEach((entry, index) =>
    append(`trainers.${index}.media`, entry.media)
  );
  content.facilities.forEach((entry, index) =>
    append(`facilities.${index}.media`, entry.media)
  );
  content.gallery.forEach((entry, index) =>
    append(`gallery.${index}.media`, entry.media)
  );
  return references;
}
