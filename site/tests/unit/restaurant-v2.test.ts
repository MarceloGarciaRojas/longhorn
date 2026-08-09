import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  registeredRendererKeys,
  rendererIsCompatible,
} from "../../src/content/renderer-manifest";
import {
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  migrateRestaurantV1ToV2,
  validateRestaurantV2Content,
} from "../../src/content/restaurant-v2-schema";
import {
  renderRestaurantEditorialIsolated,
  RestaurantEditorialCompatibilityError,
} from "../../src/content/renderers/restaurant-editorial-view";
import type { MediaRenderManifest } from "../../src/media/types";
import { syntheticRestaurantContent } from "../../scripts/db/seed";

const v1 = syntheticRestaurantContent({
  businessName: "Restaurante Sintético",
  city: "Ciudad Sintética",
  variant: "V2",
  categoryId: "11111111-1111-4111-8111-111111111111",
  itemId: "22222222-2222-4222-8222-222222222222",
});
const bundled = {
  "restaurant-hero": "33333333-3333-4333-8333-333333333333",
  "restaurant-dish-a": "44444444-4444-4444-8444-444444444444",
};
const secondItemId = "55555555-5555-4555-8555-555555555555";
const secondAssetId = "66666666-6666-4666-8666-666666666666";
const foreignAssetId = "77777777-7777-4777-8777-777777777777";
const migratedRestaurant = migrateRestaurantV1ToV2(v1, bundled);

const editorialContent = validateRestaurantV2Content({
  ...migratedRestaurant,
  menu: {
    ...migratedRestaurant.menu,
    items: [
      ...migratedRestaurant.menu.items,
      {
        id: secondItemId,
        category_id: v1.menu.categories[0].id,
        name: "Preparación editorial sintética",
        description: "Segundo elemento ficticio para comprobar la composición visual.",
        price_text: "",
        availability: true,
        order: 1,
        media: {
          assetId: secondAssetId,
          altText: "Preparación sintética presentada en un plato",
          decorative: false,
        },
      },
    ],
  },
  contact: {
    ...migratedRestaurant.contact,
    whatsapp_phone: "+56 9 0000 0002",
  },
  social: {
    instagram_url: "https://social.example.invalid/editorial",
    facebook_url: "https://social.example.invalid/editorial-facebook",
    tiktok_url: "https://social.example.invalid/editorial-tiktok",
  },
}, "publication");

const editorialMedia: MediaRenderManifest = {
  [bundled["restaurant-hero"]]: {
    hero: {
      url: `/media/${bundled["restaurant-hero"]}/hero/${"a".repeat(64)}`,
      width: 1600,
      height: 1000,
    },
  },
  [bundled["restaurant-dish-a"]]: {
    card: {
      url: `/media/${bundled["restaurant-dish-a"]}/card/${"b".repeat(64)}`,
      width: 768,
      height: 920,
    },
  },
  [secondAssetId]: {
    card: {
      url: `/api/media/private/${secondAssetId}/card`,
      width: 520,
      height: 768,
    },
  },
  [foreignAssetId]: {
    card: {
      url: `/media/${foreignAssetId}/card/${"c".repeat(64)}`,
      width: 768,
      height: 512,
    },
  },
};

interface RenderProbe {
  tags: string[];
  text: string[];
  links: string[];
  images: Array<{
    src: string;
    alt: string;
    width: number;
    height: number;
  }>;
  classes: string[];
}

function probeReactTree(root: ReactNode): RenderProbe {
  const result: RenderProbe = {
    tags: [],
    text: [],
    links: [],
    images: [],
    classes: [],
  };

  const visit = (node: ReactNode): void => {
    if (node === null || node === undefined || typeof node === "boolean") return;
    if (typeof node === "string" || typeof node === "number") {
      result.text.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isValidElement(node)) return;

    const element = node as ReactElement<Record<string, unknown>>;
    if (typeof element.type === "function") {
      const renderComponent = element.type as (
        props: Record<string, unknown>,
      ) => ReactNode;
      visit(renderComponent(element.props));
      return;
    }

    const intrinsicType = typeof element.type === "string" ? element.type : null;
    if (intrinsicType) {
      result.tags.push(intrinsicType);
      if (typeof element.props.className === "string") {
        result.classes.push(...element.props.className.split(/\s+/).filter(Boolean));
      }
      if (intrinsicType === "a" && typeof element.props.href === "string") {
        result.links.push(element.props.href);
      }
    }
    if (
      (intrinsicType === "img" || intrinsicType === null) &&
      typeof element.props.src === "string" &&
      typeof element.props.alt === "string" &&
      typeof element.props.width === "number" &&
      typeof element.props.height === "number"
    ) {
      if (intrinsicType === null) result.tags.push("img");
      result.images.push({
        src: element.props.src,
        alt: element.props.alt,
        width: element.props.width,
        height: element.props.height,
      });
    }
    visit(element.props.children as ReactNode);
  };

  visit(root);
  return result;
}

function renderEditorial(input: {
  content?: unknown;
  media?: MediaRenderManifest;
  schemaKey?: string;
  schemaVersion?: number;
  validationMode?: "draft" | "publication";
  preview?: boolean;
} = {}): RenderProbe {
  return probeReactTree(renderRestaurantEditorialIsolated({
    schemaKey: input.schemaKey ?? "restaurant.v2",
    schemaVersion: input.schemaVersion ?? 2,
    content: input.content ?? editorialContent,
    media: input.media ?? editorialMedia,
    validationMode: input.validationMode,
    preview: input.preview,
  }));
}

test("v1 to v2 migration is deterministic and preserves text, IDs and order", () => {
  const first = migrateRestaurantV1ToV2(v1, bundled);
  const second = migrateRestaurantV1ToV2(v1, bundled);
  assert.deepEqual(first, second);
  assert.equal(first.identity.business_name, v1.identity.business_name);
  assert.equal(first.menu.items[0].id, v1.menu.items[0].id);
  assert.equal(first.menu.items[0].order, v1.menu.items[0].order);
  assert.equal(first.hero.media?.assetId, bundled["restaurant-hero"]);
});

test("v2 enforces alt semantics and refuses URL/object-key fields", () => {
  const valid = migrateRestaurantV1ToV2(v1, bundled);
  assert.equal(validateRestaurantV2Content(valid, "publication").hero.media?.decorative, false);
  assert.throws(
    () => validateRestaurantV2Content({
      ...valid,
      hero: { ...valid.hero, media: { ...valid.hero.media!, altText: "" } },
    }, "draft"),
    /alt/,
  );
  assert.throws(
    () => validateRestaurantV2Content({
      ...valid,
      hero: { ...valid.hero, media: { ...valid.hero.media!, url: "https://evil.invalid" } },
    }, "draft"),
    /unknown/,
  );
});

test("only registered v2 renderers are compatible", () => {
  assert.equal(rendererIsCompatible("restaurant-classic-v2", "restaurant", "restaurant.v2", 2), true);
  assert.equal(rendererIsCompatible("restaurant-modern-v1", "restaurant", "restaurant.v2", 2), true);
  assert.equal(rendererIsCompatible("../../arbitrary", "restaurant", "restaurant.v2", 2), false);
  assert.equal(rendererIsCompatible("restaurant-modern-v1", "restaurant", "restaurant.v1", 1), false);
});

test("editorial renders complete restaurant.v2 content with semantic landmarks", () => {
  const rendered = renderEditorial({ preview: true });
  const text = rendered.text.join(" ");

  assert.equal(rendered.tags.filter((tag) => tag === "h1").length, 1);
  for (const landmark of ["main", "header", "nav", "section", "footer"]) {
    assert.ok(rendered.tags.includes(landmark), `missing ${landmark}`);
  }
  assert.ok(rendered.tags.includes("h2"));
  assert.ok(rendered.tags.includes("h3"));
  assert.ok(rendered.tags.includes("h4"));
  assert.match(text, /Restaurante Sintético/);
  assert.match(text, /Preparación editorial sintética/);
  assert.match(text, /Vista previa privada/);
  assert.ok(rendered.images.some((image) => image.alt === "Restaurante Sintético"));
  assert.ok(rendered.images.some((image) => image.alt === ""));
  assert.ok(rendered.images.every((image) => image.width > 0 && image.height > 0));
  assert.ok(rendered.links.includes("#menu"));
  assert.ok(rendered.links.includes("https://social.example.invalid/editorial"));
  assert.equal(
    rendered.links.some((link) => /nexi-interno|\/cuenta|admin/i.test(link)),
    false,
  );
  assert.doesNotMatch(text, /restaurant\.v2|restaurant-editorial-v1|33333333-/);
});

test("editorial hides absent optional fields, unresolved media and empty categories", () => {
  const content = validateRestaurantV2Content({
    ...editorialContent,
    hero: { ...editorialContent.hero, media: null },
    menu: {
      ...editorialContent.menu,
      items: editorialContent.menu.items.map((item) => ({
        ...item,
        price_text: "",
        availability: false,
        media: null,
      })),
    },
    contact: {
      ...editorialContent.contact,
      whatsapp_phone: "",
      map_url: "",
    },
    social: {
      instagram_url: "",
      facebook_url: "",
      tiktok_url: "",
    },
    footer: { legal_name: "", copyright_text: "" },
  }, "publication");
  const rendered = renderEditorial({ content, media: {} });
  const text = rendered.text.join(" ");

  assert.equal(rendered.images.length, 0);
  assert.match(text, /Carta sin productos disponibles/);
  assert.doesNotMatch(text, /\$0 demostrativo/);
  assert.doesNotMatch(text, /Redes sociales|Instagram|Facebook|TikTok/);
  assert.doesNotMatch(text, /Ver ubicación|WhatsApp/);
  assert.match(text, /Restaurante Sintético/);
});

test("editorial preserves long validated text and exposes responsive structure", () => {
  const content = validateRestaurantV2Content({
    ...editorialContent,
    identity: {
      ...editorialContent.identity,
      short_description: "S".repeat(280),
    },
    hero: {
      ...editorialContent.hero,
      headline: "H".repeat(140),
      subheadline: "L".repeat(320),
    },
    about: {
      title: "T".repeat(120),
      description: "D".repeat(1200),
    },
    menu: {
      ...editorialContent.menu,
      items: editorialContent.menu.items.map((item, index) => ({
        ...item,
        description: index === 0 ? "I".repeat(300) : item.description,
      })),
    },
  }, "publication");
  const rendered = renderEditorial({ content });
  const text = rendered.text.join("");
  const css = readFileSync(
    new URL(
      "../../src/content/renderers/restaurant-editorial.module.css",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(text, new RegExp(`H{${content.hero.headline.length}}`));
  assert.match(text, new RegExp(`D{${content.about.description.length}}`));
  assert.ok(rendered.classes.includes("hero"));
  assert.ok(rendered.classes.includes("dishList"));
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media \(min-width: 600px\)/);
  assert.match(css, /@media \(min-width: 900px\)/);
  assert.match(css, /@media \(min-width: 1440px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /focus-visible/);
  for (const token of new Set(rendered.classes)) {
    assert.match(css, new RegExp(`\\.${token}\\b`), `missing CSS token ${token}`);
  }
});

test("editorial rejects incompatible schemas and invalid v1-shaped content", () => {
  assert.throws(
    () => renderEditorial({ schemaKey: "restaurant.v1", schemaVersion: 1 }),
    RestaurantEditorialCompatibilityError,
  );
  assert.throws(
    () => renderEditorial({ schemaVersion: 3 }),
    RestaurantEditorialCompatibilityError,
  );
  assert.throws(
    () => renderEditorial({ content: v1 }),
    /hero\.hero_media_reference:unknown/,
  );
});

test("editorial output is deterministic and does not mutate its input", () => {
  const input = structuredClone(editorialContent);
  const before = JSON.stringify(input);
  const first = renderEditorial({ content: input });
  const second = renderEditorial({ content: input });

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before);
});

test("editorial only renders referenced media from safe internal manifest paths", () => {
  const unsafe: MediaRenderManifest = {
    [bundled["restaurant-hero"]]: {
      hero: {
        url: `/media/${foreignAssetId}/hero/${"d".repeat(64)}`,
        width: 1600,
        height: 900,
      },
    },
    [bundled["restaurant-dish-a"]]: {
      card: {
        url: "//evil.example.invalid/image.webp",
        width: 768,
        height: 512,
      },
    },
    [foreignAssetId]: editorialMedia[foreignAssetId],
  };
  const rendered = renderEditorial({ media: unsafe });
  const text = rendered.text.join(" ");

  assert.equal(rendered.images.length, 0);
  assert.doesNotMatch(text, /foreign|evil|cdn\.example/);
  assert.match(text, /Restaurante Sintético/);
});

test("editorial is registered only for restaurant.v2 and contains no fixed commerce data", () => {
  const source = readFileSync(
    new URL(
      "../../src/content/renderers/restaurant-editorial-view.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const keys = registeredRendererKeys();
  assert.equal(keys.includes("restaurant-editorial-v1"), true);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(
    rendererIsCompatible("restaurant-editorial-v1", "restaurant", "restaurant.v2", 2),
    true,
  );
  assert.equal(
    rendererIsCompatible("restaurant-editorial-v1", "restaurant", "restaurant.v1", 1),
    false,
  );
  assert.equal(
    rendererIsCompatible("restaurant-editorial-v1", "restaurant", "restaurant.v2", 3),
    false,
  );
  assert.doesNotMatch(source, /Restaurante Sintético|Avenida Demostración|\$0 demostrativo/);
  assert.doesNotMatch(source, /tenant_id|fetch\(|query\(|nexi-interno|\/cuenta/);
});
