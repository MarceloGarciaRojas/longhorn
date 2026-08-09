import assert from "node:assert/strict";
import test from "node:test";

import {
  parseRestaurantContent,
  RestaurantContentValidationError,
  validateRestaurantContent,
} from "../../src/content/restaurant-schema";
import {
  createRendererManifest,
  DuplicateRendererError,
  rendererIsCompatible,
  requireCompatibleRenderer,
  UnknownRendererError,
} from "../../src/content/renderer-manifest";
import {
  RESTAURANT_DAYS,
  RESTAURANT_RENDERER_KEY,
  RESTAURANT_SCHEMA_KEY,
  type RestaurantContent,
} from "../../src/content/types";

const categoryId = "10000000-0000-4000-8000-000000000001";
const itemId = "20000000-0000-4000-8000-000000000001";

function validContent(): RestaurantContent {
  return {
    identity: {
      business_name: "Restaurante Sintético",
      short_description: "Contenido exclusivamente ficticio para pruebas.",
      tagline: "Sabores de laboratorio",
    },
    hero: {
      headline: "Cocina ficticia y cercana",
      subheadline: "Una publicación sintética verificable.",
      primary_cta_label: "Ver menú",
      primary_cta_type: "menu",
      primary_cta_target: "#menu",
      hero_media_reference: "restaurant-hero",
    },
    about: {
      title: "Nuestra prueba",
      description: "Este texto no representa un negocio real.",
    },
    menu: {
      section_title: "Menú sintético",
      categories: [{
        id: categoryId,
        name: "Entradas",
        description: "Categoría de prueba",
        order: 0,
      }],
      items: [{
        id: itemId,
        category_id: categoryId,
        name: "Plato ficticio",
        description: "Preparación creada solo para validar el esquema.",
        price_text: "$0",
        availability: true,
        order: 0,
        media_reference: "restaurant-dish-a",
      }],
    },
    hours: RESTAURANT_DAYS.map((day) => ({
      day,
      is_open: day !== "sunday",
      opening_time: day === "sunday" ? "" : "12:00",
      closing_time: day === "sunday" ? "" : "20:00",
      note: day === "sunday" ? "Cerrado" : "",
    })),
    contact: {
      public_email: "contacto@example.invalid",
      public_phone: "+56 2 0000 0000",
      whatsapp_phone: "",
      address_line: "Calle Ficticia 100",
      city: "Ciudad Sintética",
      map_url: "https://example.invalid/mapa",
    },
    social: {
      instagram_url: "https://example.invalid/instagram",
      facebook_url: "",
      tiktok_url: "",
    },
    seo: {
      title: "Restaurante Sintético",
      description: "Sitio ficticio usado para comprobar restaurant.v1.",
    },
    footer: {
      legal_name: "Restaurante Sintético SpA",
      copyright_text: "Contenido ficticio.",
    },
  };
}

function expectValidation(
  mutate: (content: RestaurantContent & Record<string, unknown>) => void,
  expectedField: string,
): void {
  const content = structuredClone(validContent()) as RestaurantContent &
    Record<string, unknown>;
  mutate(content);
  assert.throws(
    () => validateRestaurantContent(content, "publication"),
    (error) =>
      error instanceof RestaurantContentValidationError &&
      error.field === expectedField,
  );
}

test("restaurant.v1 validates and preserves stable identifiers", () => {
  const result = validateRestaurantContent(validContent(), "publication");
  assert.equal(result.menu.categories[0].id, categoryId);
  assert.equal(result.menu.items[0].id, itemId);
  assert.equal(result.menu.items[0].category_id, categoryId);
});

test("restaurant.v1 rejects HTML, executable text and unknown fields", () => {
  expectValidation(
    (content) => {
      content.identity.business_name = "<strong>Unsafe</strong>";
    },
    "identity.business_name",
  );
  expectValidation(
    (content) => {
      content.hero.subheadline = "javascript:alert(1)";
    },
    "hero.subheadline",
  );
  expectValidation(
    (content) => {
      content.unapproved = "field";
    },
    "content.unapproved",
  );
});

test("restaurant.v1 rejects unsafe URLs and arbitrary media references", () => {
  expectValidation(
    (content) => {
      content.social.instagram_url = "javascript:alert(1)";
    },
    "social.instagram_url",
  );
  expectValidation(
    (content) => {
      content.hero.hero_media_reference =
        "https://images.example.invalid/arbitrary.jpg" as never;
    },
    "hero.hero_media_reference",
  );
});

test("restaurant.v1 rejects oversized serialized payloads and limits", () => {
  assert.throws(
    () => parseRestaurantContent(`{"padding":"${"x".repeat(70_000)}"}`, "draft"),
    (error) =>
      error instanceof RestaurantContentValidationError &&
      error.field === "content" &&
      error.reason === "size",
  );
  expectValidation(
    (content) => {
      content.menu.categories = Array.from({ length: 9 }, (_, index) => ({
        id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        name: `Categoría ${index}`,
        description: "",
        order: index,
      }));
    },
    "menu.categories",
  );
});

test("renderer registry is explicit and rejects unknown or incompatible keys", () => {
  assert.equal(
    rendererIsCompatible(RESTAURANT_RENDERER_KEY, "restaurant", RESTAURANT_SCHEMA_KEY, 1),
    true,
  );
  assert.equal(
    rendererIsCompatible("unknown-renderer", "restaurant", RESTAURANT_SCHEMA_KEY, 1),
    false,
  );
  assert.throws(
    () =>
      requireCompatibleRenderer(
        "unknown-renderer",
        "restaurant",
        RESTAURANT_SCHEMA_KEY,
        1,
      ),
    UnknownRendererError,
  );
  assert.throws(
    () => createRendererManifest([
      ["duplicated-renderer", {
        industryKey: "restaurant",
        schemaKey: RESTAURANT_SCHEMA_KEY,
        minimumSchemaVersion: 1,
        maximumSchemaVersion: 1,
      }],
      ["duplicated-renderer", {
        industryKey: "restaurant",
        schemaKey: RESTAURANT_SCHEMA_KEY,
        minimumSchemaVersion: 1,
        maximumSchemaVersion: 1,
      }],
    ]),
    DuplicateRendererError,
  );
});
