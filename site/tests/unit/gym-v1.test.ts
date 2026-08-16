import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  GYM_CONTENT_MAX_BYTES,
  GymContentValidationError,
  gymV1ContentChecksum,
  gymV1MediaReferences,
  parseGymV1Content,
  validateGymV1Content,
} from "../../src/content/gym-v1-schema";
import {
  contentSchemaIsCompatible,
  ContentSchemaUnavailableError,
  ContentSchemaValidationError,
  parseContentForSchema,
  validateContentForSchema,
} from "../../src/content/schema-dispatch";
import {
  registeredRendererKeys,
  rendererIsCompatible,
} from "../../src/content/renderer-manifest";
import {
  GymPulsoCompatibilityError,
  renderGymPulsoIsolated,
} from "../../src/content/renderers/gym-pulso-view";
import { visiblePulsoClassIndexes } from "../../src/content/renderers/gym-pulso-class-filter";
import type { MediaRenderManifest } from "../../src/media/types";
import type { GymContentV1 } from "../../src/content/types";
import {
  GYM_FIXTURE_IDS,
  completeGymV1Fixture,
  gymV1VariantFixture,
  gymV1WithoutMediaFixture,
  longGymV1Fixture,
  minimumGymV1Fixture,
} from "../fixtures/gym-v1";

interface GymRenderProbe {
  tags: string[];
  text: string[];
  links: string[];
  images: Array<{ src: string; alt: string; width: number; height: number }>;
  classes: string[];
}

function probeGymReactTree(root: ReactNode): GymRenderProbe {
  const result: GymRenderProbe = {
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

    const tag = typeof element.type === "string" ? element.type : null;
    if (tag) {
      result.tags.push(tag);
      if (typeof element.props.className === "string") {
        result.classes.push(...element.props.className.split(/\s+/).filter(Boolean));
      }
      if (tag === "a" && typeof element.props.href === "string") {
        result.links.push(element.props.href);
      }
    }
    if (
      tag === "img" &&
      typeof element.props.src === "string" &&
      typeof element.props.alt === "string" &&
      typeof element.props.width === "number" &&
      typeof element.props.height === "number"
    ) {
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

function gymMediaManifest(): MediaRenderManifest {
  const manifest: MediaRenderManifest = {};
  const checksum = "a".repeat(64);
  for (const assetId of [
    GYM_FIXTURE_IDS.logo,
    GYM_FIXTURE_IDS.hero,
    GYM_FIXTURE_IDS.class,
    GYM_FIXTURE_IDS.trainerMedia,
    GYM_FIXTURE_IDS.facility,
    GYM_FIXTURE_IDS.gallery,
  ]) {
    manifest[assetId] = {
      thumbnail: {
        url: `/media/${assetId}/thumbnail/${checksum}`,
        width: 256,
        height: 256,
      },
      card: {
        url: `/media/${assetId}/card/${checksum}`,
        width: 768,
        height: 640,
      },
      hero: {
        url: `/media/${assetId}/hero/${checksum}`,
        width: 1600,
        height: 1000,
      },
    };
  }
  return manifest;
}

function renderGymPulso(input: {
  content?: unknown;
  media?: MediaRenderManifest;
  industryKey?: string;
  schemaKey?: string;
  schemaVersion?: number;
  preview?: boolean;
} = {}): GymRenderProbe {
  return probeGymReactTree(renderGymPulsoIsolated({
    industryKey: input.industryKey ?? "gym",
    schemaKey: input.schemaKey ?? "gym.v1",
    schemaVersion: input.schemaVersion ?? 1,
    content: input.content ?? completeGymV1Fixture(),
    media: input.media ?? gymMediaManifest(),
    preview: input.preview,
  }));
}

function expectField(operation: () => unknown, field: string): void {
  assert.throws(operation, (error: unknown) =>
    error instanceof GymContentValidationError && error.field === field
  );
}

test("gym.v1 validates complete, minimum and no-media fixtures", () => {
  assert.equal(validateGymV1Content(completeGymV1Fixture(), "publication").classes.length, 1);
  const minimum = validateGymV1Content(minimumGymV1Fixture(), "publication");
  assert.equal(minimum.schedule[0].trainer_id, null);
  assert.equal(minimum.plans[0].featured, false);
  assert.equal(minimum.hours.length, 1);
  assert.deepEqual(gymV1MediaReferences(
    validateGymV1Content(gymV1WithoutMediaFixture(), "publication"),
  ), []);
});

test("gym.v1 accepts partial hours and rejects inconsistent present days", () => {
  const partial = validateGymV1Content(minimumGymV1Fixture(), "publication");
  assert.deepEqual(partial.hours.map((entry) => entry.day), ["monday"]);

  const duplicate = completeGymV1Fixture();
  duplicate.hours[1] = { ...duplicate.hours[0] };
  expectField(() => validateGymV1Content(duplicate, "publication"), "hours.day");

  const invalidTime = completeGymV1Fixture();
  invalidTime.hours[0].opening_time = "25:00";
  expectField(() => validateGymV1Content(invalidTime, "publication"), "hours.0");

  const unknownDay = completeGymV1Fixture() as unknown as Record<string, unknown>;
  ((unknownDay.hours as Record<string, unknown>[])[0]).day = "holiday";
  expectField(() => validateGymV1Content(unknownDay, "publication"), "hours.0.day");
});

test("gym.v1 accepts exactly the three approved appearance variants", () => {
  for (const variant of ["volt", "studio", "forge"] as const) {
    assert.equal(
      validateGymV1Content(gymV1VariantFixture(variant), "publication")
        .appearance.variant,
      variant,
    );
  }
  const invalid = completeGymV1Fixture() as unknown as Record<string, unknown>;
  (invalid.appearance as Record<string, unknown>).variant = "arbitrary";
  expectField(() => validateGymV1Content(invalid, "publication"), "appearance.variant");
});

test("gym.v1 rejects unknown fields, unsafe values and invalid controlled values", () => {
  const unknown = completeGymV1Fixture() as unknown as Record<string, unknown>;
  unknown.renderer = "gym-fallback";
  expectField(() => validateGymV1Content(unknown, "publication"), "content.renderer");

  const unsafe = completeGymV1Fixture();
  unsafe.hero.headline = "<script>alert(1)</script>";
  expectField(() => validateGymV1Content(unsafe, "publication"), "hero.headline");

  const invalidDuration = completeGymV1Fixture();
  invalidDuration.classes[0].duration_minutes = 0;
  expectField(
    () => validateGymV1Content(invalidDuration, "publication"),
    "classes.0.duration_minutes",
  );

  const missing = completeGymV1Fixture() as unknown as Record<string, unknown>;
  delete missing.hero;
  expectField(() => validateGymV1Content(missing, "publication"), "hero");

  const unsafeUrl = completeGymV1Fixture();
  unsafeUrl.location.map_url = "javascript:alert(1)";
  expectField(() => validateGymV1Content(unsafeUrl, "publication"), "location.map_url");

  const invalidTime = completeGymV1Fixture();
  invalidTime.schedule[0].start_time = "25:00";
  expectField(
    () => validateGymV1Content(invalidTime, "publication"),
    "schedule.0.start_time",
  );

  const invalidPrice = completeGymV1Fixture();
  invalidPrice.plans[0].price_text = "<iframe src='https://example.com'></iframe>";
  expectField(
    () => validateGymV1Content(invalidPrice, "publication"),
    "plans.0.price_text",
  );
});

test("gym.v1 rejects broken class, trainer and schedule associations", () => {
  const category = completeGymV1Fixture();
  category.classes[0].category_id = "93000000-0000-4000-8000-000000000001";
  expectField(
    () => validateGymV1Content(category, "publication"),
    "classes.0.category_id",
  );

  const classReference = completeGymV1Fixture();
  classReference.schedule[0].class_id = "93000000-0000-4000-8000-000000000002";
  expectField(
    () => validateGymV1Content(classReference, "publication"),
    "schedule.0.class_id",
  );

  const trainer = completeGymV1Fixture();
  trainer.schedule[0].trainer_id = "93000000-0000-4000-8000-000000000003";
  expectField(
    () => validateGymV1Content(trainer, "publication"),
    "schedule.0.trainer_id",
  );

  const duplicate = completeGymV1Fixture();
  duplicate.classes.push({ ...duplicate.classes[0], order: 1 });
  expectField(() => validateGymV1Content(duplicate, "publication"), "classes.id");
});

test("gym.v1 enforces media identifiers and accessible alternative text", () => {
  const invalidId = completeGymV1Fixture();
  invalidId.hero.media!.assetId = "not-a-uuid";
  expectField(
    () => validateGymV1Content(invalidId, "publication"),
    "hero.media.assetId",
  );

  const missingAlt = completeGymV1Fixture();
  missingAlt.hero.media!.altText = "";
  expectField(
    () => validateGymV1Content(missingAlt, "publication"),
    "hero.media.altText",
  );

  const decorative = completeGymV1Fixture();
  decorative.hero.media = {
    ...decorative.hero.media!,
    decorative: true,
    altText: "",
  };
  assert.equal(
    validateGymV1Content(decorative, "publication").hero.media?.decorative,
    true,
  );
});

test("gym.v1 extraction is explicit and ordered by approved media roles", () => {
  const content = validateGymV1Content(completeGymV1Fixture(), "publication");
  assert.deepEqual(
    gymV1MediaReferences(content).map((reference) => reference.fieldPath),
    [
      "identity.logo",
      "hero.media",
      "classes.0.media",
      "trainers.0.media",
      "facilities.0.media",
      "gallery.0.media",
    ],
  );
});

test("gym.v1 validation is deterministic and does not mutate input", () => {
  const input = completeGymV1Fixture();
  input.method.pillars[0].order = 2;
  const before = structuredClone(input);
  const first = validateGymV1Content(input, "publication");
  const second = validateGymV1Content(structuredClone(input), "publication");
  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.equal(gymV1ContentChecksum(first), gymV1ContentChecksum(second));

  const changed = structuredClone(second);
  changed.hero.headline = "Otro mensaje";
  assert.notEqual(gymV1ContentChecksum(first), gymV1ContentChecksum(changed));
});

test("gym.v1 parsing rejects malformed and excessive content", () => {
  expectField(() => parseGymV1Content("{", "draft"), "content");
  assert.equal(validateGymV1Content(longGymV1Fixture(), "publication").classes.length, 1);
  const excessive = completeGymV1Fixture();
  excessive.method.description = "Entrenamiento progresivo. ".repeat(3_000);
  expectField(() => validateGymV1Content(excessive, "publication"), "method.description");
  assert.ok(Buffer.byteLength(JSON.stringify(excessive), "utf8") > GYM_CONTENT_MAX_BYTES);
});

test("schema dispatch registers gym.v1 only for Gym and normalizes errors", () => {
  assert.equal(contentSchemaIsCompatible("gym", "gym.v1", 1), true);
  assert.equal(contentSchemaIsCompatible("restaurant", "gym.v1", 1), false);
  assert.equal(contentSchemaIsCompatible("gym", "restaurant.v1", 1), false);
  assert.equal(contentSchemaIsCompatible("gym", "gym.v2", 2), false);
  assert.equal(contentSchemaIsCompatible("gym", "gym.v1", 2), false);
  assert.deepEqual(
    (parseContentForSchema(
      "gym",
      "gym.v1",
      1,
      JSON.stringify(minimumGymV1Fixture()),
      "publication",
    ) as GymContentV1).appearance.variant,
    "volt",
  );
  assert.throws(
    () => validateContentForSchema("restaurant", "gym.v1", 1, {}, "draft"),
    ContentSchemaUnavailableError,
  );
  assert.throws(
    () => validateContentForSchema("gym", "gym.v1", 1, {}, "draft"),
    ContentSchemaValidationError,
  );
});

test("Pulso Club isolated renderer exposes semantic Gym content without privileged flows", () => {
  const rendered = renderGymPulso({ preview: true });
  const text = rendered.text.join(" ");

  assert.equal(rendered.tags[0], "main");
  assert.equal(rendered.tags.filter((tag) => tag === "h1").length, 1);
  for (const tag of ["header", "nav", "section", "article", "aside", "footer"]) {
    assert.ok(rendered.tags.includes(tag), `missing semantic tag ${tag}`);
  }
  assert.match(text, /Vista previa privada/);
  assert.match(text, /Nexo Fuerza Ficticio/);
  assert.match(text, /Encuentra tu próximo nivel/);
  assert.match(text, /Fuerza total/);
  assert.match(text, /Camila Soto/);
  assert.match(text, /Plan Base/);
  assert.match(text, /Av\. Ejemplo 123/);
  assert.equal(rendered.images.length, 6);
  assert.ok(rendered.links.includes("#contacto"));
  assert.ok(rendered.links.includes("#clases"));
  assert.ok(rendered.tags.includes("details"));
  assert.ok(rendered.tags.includes("summary"));
  assert.doesNotMatch(text, /administrar|iniciar sesión|reserva confirmada|cupos disponibles/i);
  assert.doesNotMatch(text, /tenant_id|schema_key|renderer_key/i);
});

test("Pulso Club supports only the approved visual controls and responsive CSS", () => {
  const css = readFileSync(
    new URL("../../src/content/renderers/gym-pulso.module.css", import.meta.url),
    "utf8",
  );
  const variants = [
    ["volt", "variantVolt"],
    ["studio", "variantStudio"],
    ["forge", "variantForge"],
  ] as const;

  for (const [variant, token] of variants) {
    const content = gymV1VariantFixture(variant);
    const rendered = renderGymPulso({ content });
    assert.ok(rendered.classes.includes(token));
    assert.match(css, new RegExp(`\\.${token}\\b`));
  }

  const controlled = completeGymV1Fixture();
  controlled.appearance = {
    variant: "studio",
    hero_layout: "stacked",
    method_layout: "left",
    title_scale: "compact",
    media_density: "balanced",
    class_columns: 4,
    spacing: "spacious",
  };
  const rendered = renderGymPulso({ content: controlled });
  for (const token of [
    "heroStacked",
    "methodLeft",
    "titleCompact",
    "mediaBalanced",
    "columns4",
    "spacingSpacious",
  ]) {
    assert.ok(rendered.classes.includes(token));
  }
  for (const token of new Set(rendered.classes)) {
    assert.match(css, new RegExp(`\\.${token}\\b`), `missing CSS token ${token}`);
  }
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /@media \(min-width: 42rem\)/);
  assert.match(css, /@media \(min-width: 56rem\)/);
  assert.match(css, /@media \(min-width: 90rem\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /focus-visible/);
  assert.match(css, /\.mobileMenu\b/);
  assert.match(css, /\.filterTabs\b/);
  assert.match(css, /:hover/);
  assert.doesNotMatch(css, /!important/);
});

test("Pulso Club class filters are closed, content-derived and ephemeral", () => {
  const categoryIds = ["strength", "cardio", "strength"];
  assert.deepEqual(visiblePulsoClassIndexes(categoryIds, "all"), [0, 1, 2]);
  assert.deepEqual(visiblePulsoClassIndexes(categoryIds, "strength"), [0, 2]);
  assert.deepEqual(visiblePulsoClassIndexes(categoryIds, "unknown"), []);

  const source = readFileSync(
    new URL(
      "../../src/content/renderers/gym-pulso-class-browser.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /<button/);
  assert.match(source, /role="group"/);
  assert.match(source, /aria-pressed/);
  assert.match(source, /aria-live="polite"/);
  assert.doesNotMatch(source, /role="tab(?:list|panel)?"|aria-selected/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|fetch\(|query\(|tenant_id/);
});

test("Pulso Club preserves informative gallery alt text and honors decorative media", () => {
  const content = completeGymV1Fixture();
  content.gallery.push(
    {
      id: "92000000-0000-4000-8000-000000000010",
      visible: true,
      order: 1,
      media: {
        assetId: GYM_FIXTURE_IDS.gallery,
        altText: "Área de movilidad junto a la zona de fuerza",
        decorative: false,
      },
    },
    {
      id: "92000000-0000-4000-8000-000000000011",
      visible: true,
      order: 2,
      media: {
        assetId: GYM_FIXTURE_IDS.gallery,
        altText: "",
        decorative: true,
      },
    },
  );

  const rendered = renderGymPulso({ content });
  const galleryAlts = rendered.images
    .filter((image) => image.src.includes(`/${GYM_FIXTURE_IDS.gallery}/`))
    .map((image) => image.alt);
  assert.deepEqual(galleryAlts, [
    "Vista interior del gimnasio ficticio",
    "Área de movilidad junto a la zona de fuerza",
    "",
  ]);

  const invalid = completeGymV1Fixture();
  invalid.gallery[0].media.altText = "";
  assert.throws(
    () => renderGymPulso({ content: invalid }),
    GymContentValidationError,
  );
});

test("Pulso Club navigation and schedule share visible class derivation", () => {
  const visibleContent = completeGymV1Fixture();
  const visible = renderGymPulso({ content: visibleContent });
  assert.ok(visible.links.includes("#clases"));
  assert.match(visible.text.join(" "), /Organiza tu semana/);

  const mixedContent = completeGymV1Fixture();
  mixedContent.classes.push({
    ...structuredClone(mixedContent.classes[0]),
    id: "92000000-0000-4000-8000-000000000012",
    name: "Clase interna no publicada",
    visible: false,
    order: 1,
  });
  mixedContent.schedule.push({
    ...structuredClone(mixedContent.schedule[0]),
    id: "92000000-0000-4000-8000-000000000013",
    class_id: "92000000-0000-4000-8000-000000000012",
    trainer_id: null,
    order: 1,
  });
  const mixed = renderGymPulso({ content: mixedContent });
  assert.match(mixed.text.join(" "), /Organiza tu semana/);
  assert.doesNotMatch(mixed.text.join(" "), /Clase interna no publicada/);

  const hiddenContent = completeGymV1Fixture();
  hiddenContent.classes.forEach((entry) => {
    entry.visible = false;
  });
  const hidden = renderGymPulso({ content: hiddenContent });
  assert.equal(hidden.links.includes("#clases"), false);
  assert.doesNotMatch(hidden.text.join(" "), /Clases para avanzar|Organiza tu semana/);
});

test("Pulso Club renders only visible social links with validated URLs", () => {
  const content = completeGymV1Fixture();
  content.contact.social = [
    {
      id: GYM_FIXTURE_IDS.social,
      network: "instagram",
      url: "https://instagram.com/nexofuerzaficticio",
      visible: true,
      order: 0,
    },
    {
      id: "92000000-0000-4000-8000-000000000014",
      network: "facebook",
      url: "https://facebook.com/nexofuerzaficticio",
      visible: false,
      order: 1,
    },
    {
      id: "92000000-0000-4000-8000-000000000015",
      network: "tiktok",
      url: "",
      visible: true,
      order: 2,
    },
  ];

  const rendered = renderGymPulso({ content });
  assert.ok(rendered.links.includes("https://instagram.com/nexofuerzaficticio"));
  assert.equal(
    rendered.links.includes("https://facebook.com/nexofuerzaficticio"),
    false,
  );
  assert.equal(rendered.links.includes(""), false);

  const unsafe = completeGymV1Fixture();
  unsafe.contact.social[0].url = "javascript:alert(1)";
  assert.throws(
    () => renderGymPulso({ content: unsafe }),
    GymContentValidationError,
  );
});

test("Pulso Club handles minimum content, missing media and partial hours", () => {
  const content = minimumGymV1Fixture();
  const rendered = renderGymPulso({ content, media: {} });
  const text = rendered.text.join(" ");

  assert.equal(rendered.images.length, 0);
  assert.match(text, /Nexo Fuerza Ficticio/);
  assert.match(text, /Lunes/);
  assert.doesNotMatch(text, /Sábado/);
  assert.ok(rendered.classes.includes("heroStage"));
  assert.ok(rendered.classes.includes("trainerInitial") === false);
});

test("Pulso Club degrades safely with a partial media manifest", () => {
  const fullManifest = gymMediaManifest();
  const partialManifest: MediaRenderManifest = {
    [GYM_FIXTURE_IDS.logo]: fullManifest[GYM_FIXTURE_IDS.logo],
    [GYM_FIXTURE_IDS.hero]: fullManifest[GYM_FIXTURE_IDS.hero],
  };
  const rendered = renderGymPulso({ media: partialManifest });

  assert.equal(rendered.images.length, 2);
  assert.match(rendered.text.join(" "), /Fuerza total/);
  assert.match(rendered.text.join(" "), /Camila Soto/);
});

test("Pulso Club fails closed for incompatible industry, schema and content", () => {
  assert.throws(
    () => renderGymPulso({ industryKey: "restaurant" }),
    GymPulsoCompatibilityError,
  );
  assert.throws(
    () => renderGymPulso({ schemaKey: "restaurant.v1" }),
    GymPulsoCompatibilityError,
  );
  assert.throws(
    () => renderGymPulso({ schemaKey: "restaurant.v2" }),
    GymPulsoCompatibilityError,
  );
  assert.throws(
    () => renderGymPulso({ schemaKey: "gym.unknown" }),
    GymPulsoCompatibilityError,
  );
  assert.throws(
    () => renderGymPulso({ schemaVersion: 2 }),
    GymPulsoCompatibilityError,
  );
  const invalid = completeGymV1Fixture() as unknown as Record<string, unknown>;
  delete invalid.hero;
  assert.throws(() => renderGymPulso({ content: invalid }), GymContentValidationError);
});

test("Pulso Club renders only referenced media with safe internal manifest paths", () => {
  const unsafe: MediaRenderManifest = {
    [GYM_FIXTURE_IDS.hero]: {
      hero: {
        url: "https://evil.example.invalid/hero.webp",
        width: 1600,
        height: 900,
      },
    },
    [GYM_FIXTURE_IDS.class]: {
      card: {
        url: `/media/${GYM_FIXTURE_IDS.gallery}/card/${"b".repeat(64)}`,
        width: 768,
        height: 640,
      },
    },
  };
  const rendered = renderGymPulso({ media: unsafe });

  assert.equal(rendered.images.length, 0);
  assert.doesNotMatch(rendered.text.join(" "), /evil\.example|foreign/i);
});

test("Pulso Club output is deterministic, immutable and resilient to valid long content", () => {
  const input = longGymV1Fixture();
  const before = structuredClone(input);
  const first = renderGymPulso({ content: input });
  const second = renderGymPulso({ content: input });

  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.match(first.text.join(""), new RegExp(`D?${input.method.description.slice(0, 24)}`));
});

test("Pulso Club is registered exactly for Gym preview without browser state", () => {
  const source = readFileSync(
    new URL("../../src/content/renderers/gym-pulso-view.tsx", import.meta.url),
    "utf8",
  );
  const keys = registeredRendererKeys();

  assert.equal(keys.includes("gym-pulso-v1"), true);
  assert.equal(rendererIsCompatible("gym-pulso-v1", "gym", "gym.v1", 1), true);
  assert.equal(rendererIsCompatible("gym-pulso-v1", "restaurant", "gym.v1", 1), false);
  assert.equal(rendererIsCompatible("gym-pulso-v1", "gym", "restaurant.v2", 2), false);
  assert.doesNotMatch(source, /Pulso Club|Gimnasio Pulso|Nexo Fuerza Ficticio/);
  assert.doesNotMatch(source, /tenant_id|fetch\(|query\(|localStorage|\/admin|contraseñ|password/i);
  assert.doesNotMatch(source, /confirmar reserva|crear reserva|reservar cupo|bookGym/i);
});
