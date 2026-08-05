import { validateRestaurantContent } from "./restaurant-schema";
import {
  RESTAURANT_CONTENT_MAX_BYTES,
} from "./restaurant-schema";
import type {
  RestaurantContent,
  RestaurantContentV2,
  RestaurantMediaReference,
  RestaurantMediaUsage,
} from "./types";
import { RestaurantContentValidationError } from "./restaurant-schema";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXECUTABLE =
  /<[^>]*>|\bjavascript\s*:|\bdata\s*:\s*text|\bon\w+\s*=|&lt;\s*(?:script|iframe)/i;

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RestaurantContentValidationError(field, "type");
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  field: string,
  allowed: readonly string[],
): void {
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra) {
    throw new RestaurantContentValidationError(`${field}.${extra}`, "unknown");
  }
}

function mediaUsage(
  value: unknown,
  field: string,
): RestaurantMediaUsage | null {
  if (value === null) return null;
  const usage = record(value, field);
  exactKeys(usage, field, ["assetId", "altText", "decorative"]);
  if (typeof usage.assetId !== "string" || !UUID.test(usage.assetId)) {
    throw new RestaurantContentValidationError(`${field}.assetId`, "id");
  }
  if (typeof usage.decorative !== "boolean") {
    throw new RestaurantContentValidationError(`${field}.decorative`, "type");
  }
  if (typeof usage.altText !== "string") {
    throw new RestaurantContentValidationError(`${field}.altText`, "type");
  }
  const altText = usage.altText.trim();
  if (
    altText.length > 250 ||
    (usage.decorative && altText !== "") ||
    (!usage.decorative && altText.length === 0) ||
    EXECUTABLE.test(altText)
  ) {
    throw new RestaurantContentValidationError(`${field}.altText`, "alt");
  }
  return {
    assetId: usage.assetId.toLowerCase(),
    altText,
    decorative: usage.decorative,
  };
}

export function validateRestaurantV2Content(
  input: unknown,
  mode: "draft" | "publication",
): RestaurantContentV2 {
  const root = record(input, "content");
  exactKeys(root, "content", [
    "identity",
    "hero",
    "about",
    "menu",
    "hours",
    "contact",
    "social",
    "seo",
    "footer",
  ]);
  const hero = record(root.hero, "hero");
  exactKeys(hero, "hero", [
    "headline",
    "subheadline",
    "primary_cta_label",
    "primary_cta_type",
    "primary_cta_target",
    "media",
  ]);
  const menu = record(root.menu, "menu");
  exactKeys(menu, "menu", ["section_title", "categories", "items"]);
  if (!Array.isArray(menu.items)) {
    throw new RestaurantContentValidationError("menu.items", "type");
  }
  const itemMedia = new Map<string, RestaurantMediaUsage | null>();
  menu.items.forEach((entry, index) => {
    const item = record(entry, `menu.items.${index}`);
    exactKeys(item, `menu.items.${index}`, [
      "id",
      "category_id",
      "name",
      "description",
      "price_text",
      "availability",
      "order",
      "media",
    ]);
    if (typeof item.id !== "string") {
      throw new RestaurantContentValidationError(`menu.items.${index}.id`, "type");
    }
    itemMedia.set(
      item.id,
      mediaUsage(item.media, `menu.items.${index}.media`),
    );
  });
  const heroMedia = mediaUsage(hero.media, "hero.media");
  const v1Candidate = {
    ...root,
    hero: {
      ...hero,
      hero_media_reference: "",
    },
    menu: {
      ...menu,
      items: menu.items.map((entry) => {
        const item = { ...record(entry, "menu.items") };
        delete item.media;
        return { ...item, media_reference: "" };
      }),
    },
  } as Record<string, unknown>;
  delete (v1Candidate.hero as Record<string, unknown>).media;
  const validated = validateRestaurantContent(v1Candidate, mode);
  const result: RestaurantContentV2 = {
    ...validated,
    hero: {
      headline: validated.hero.headline,
      subheadline: validated.hero.subheadline,
      primary_cta_label: validated.hero.primary_cta_label,
      primary_cta_type: validated.hero.primary_cta_type,
      primary_cta_target: validated.hero.primary_cta_target,
      media: heroMedia,
    },
    menu: {
      ...validated.menu,
      items: validated.menu.items.map((item) => ({
        id: item.id,
        category_id: item.category_id,
        name: item.name,
        description: item.description,
        price_text: item.price_text,
        availability: item.availability,
        order: item.order,
        media: itemMedia.get(item.id) ?? null,
      })),
    },
  };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > RESTAURANT_CONTENT_MAX_BYTES) {
    throw new RestaurantContentValidationError("content", "size");
  }
  return result;
}

export function parseRestaurantV2Content(
  serialized: string,
  mode: "draft" | "publication",
): RestaurantContentV2 {
  if (Buffer.byteLength(serialized, "utf8") > RESTAURANT_CONTENT_MAX_BYTES) {
    throw new RestaurantContentValidationError("content", "size");
  }
  try {
    return validateRestaurantV2Content(JSON.parse(serialized), mode);
  } catch (error) {
    if (error instanceof RestaurantContentValidationError) throw error;
    throw new RestaurantContentValidationError("content", "json");
  }
}

export function migrateRestaurantV1ToV2(
  content: RestaurantContent,
  bundledAssets: Readonly<
    Partial<Record<RestaurantMediaReference, string>>
  >,
): RestaurantContentV2 {
  const resolve = (
    reference: RestaurantMediaReference | "",
    altText: string,
  ): RestaurantMediaUsage | null => {
    if (!reference || reference === "placeholder") return null;
    const assetId = bundledAssets[reference];
    if (!assetId || !UUID.test(assetId)) {
      throw new RestaurantContentValidationError("media", "bundled_unresolved");
    }
    return { assetId, altText: altText.trim(), decorative: false };
  };
  return validateRestaurantV2Content({
    ...content,
    hero: {
      headline: content.hero.headline,
      subheadline: content.hero.subheadline,
      primary_cta_label: content.hero.primary_cta_label,
      primary_cta_type: content.hero.primary_cta_type,
      primary_cta_target: content.hero.primary_cta_target,
      media: resolve(
        content.hero.hero_media_reference,
        content.identity.business_name,
      ),
    },
    menu: {
      ...content.menu,
      items: content.menu.items.map((item) => ({
        id: item.id,
        category_id: item.category_id,
        name: item.name,
        description: item.description,
        price_text: item.price_text,
        availability: item.availability,
        order: item.order,
        media: resolve(item.media_reference, item.name),
      })),
    },
  }, "draft");
}
