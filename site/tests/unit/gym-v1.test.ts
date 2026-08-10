import assert from "node:assert/strict";
import test from "node:test";
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
import type { GymContentV1 } from "../../src/content/types";
import {
  completeGymV1Fixture,
  gymV1VariantFixture,
  gymV1WithoutMediaFixture,
  longGymV1Fixture,
  minimumGymV1Fixture,
} from "../fixtures/gym-v1";

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
