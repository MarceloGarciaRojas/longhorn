import assert from "node:assert/strict";
import test from "node:test";

import {
  GYM_INDUSTRY_KEY,
  INDUSTRY_KEYS,
  RESTAURANT_INDUSTRY_KEY,
  UnknownIndustryError,
  requireIndustryKey,
} from "../../src/content/industry";
import {
  ContentSchemaUnavailableError,
  contentSchemaIsCompatible,
  registeredContentSchemas,
  requireCompatibleContentSchema,
} from "../../src/content/schema-dispatch";
import {
  registeredRendererKeys,
  rendererIsCompatible,
} from "../../src/content/renderer-manifest";
import {
  compatibleTemplateCatalog,
  rendererOnboardingIsAllowed,
  rendererPublicationIsAllowed,
} from "../../src/content/template-capabilities";
import type { TemplateOption } from "../../src/content/types";

const restaurantCatalog: TemplateOption[] = [
  ["restaurant-classic", "restaurant-classic-v2"],
  ["restaurant-modern", "restaurant-modern-v1"],
  ["restaurant-editorial", "restaurant-editorial-v1"],
].map(([templateKey, rendererKey], index) => ({
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  templateId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  templateKey,
  displayName: templateKey,
  description: "Catálogo Restaurant de prueba",
  industryKey: RESTAURANT_INDUSTRY_KEY,
  version: 1,
  rendererKey,
  schemaKey: "restaurant.v2",
  minimumSchemaVersion: 2,
  maximumSchemaVersion: 2,
  status: "active",
  previewKey: templateKey,
}));

test("industry registry is closed to restaurant and gym", () => {
  assert.deepEqual(INDUSTRY_KEYS, ["restaurant", "gym"]);
  assert.equal(requireIndustryKey(RESTAURANT_INDUSTRY_KEY), "restaurant");
  assert.equal(requireIndustryKey(GYM_INDUSTRY_KEY), "gym");
  for (const invalid of ["shop", "school", "fitness", "arbitrary", "", null]) {
    assert.throws(() => requireIndustryKey(invalid), UnknownIndustryError);
  }
});

test("content schema registry is closed to Restaurant v1/v2 and Gym v1", () => {
  assert.deepEqual(
    registeredContentSchemas().map(({ industryKey, schemaKey, schemaVersion }) =>
      `${industryKey}:${schemaKey}:${schemaVersion}`
    ),
    [
      "restaurant:restaurant.v1:1",
      "restaurant:restaurant.v2:2",
      "gym:gym.v1:1",
    ],
  );
  assert.equal(contentSchemaIsCompatible("restaurant", "restaurant.v1", 1), true);
  assert.equal(contentSchemaIsCompatible("restaurant", "restaurant.v2", 2), true);
  assert.equal(contentSchemaIsCompatible("gym", "gym.v1", 1), true);
  assert.equal(contentSchemaIsCompatible("gym", "restaurant.v2", 2), false);
  assert.equal(requireCompatibleContentSchema("gym", "gym.v1", 1).schemaKey, "gym.v1");
  assert.throws(
    () => requireCompatibleContentSchema("gym", "gym.v2", 2),
    ContentSchemaUnavailableError,
  );
});

test("renderer registry remains Restaurant-only", () => {
  assert.equal(registeredRendererKeys().length, 4);
  for (const rendererKey of [
    "restaurant-classic-v2",
    "restaurant-modern-v1",
    "restaurant-editorial-v1",
  ]) {
    assert.equal(
      rendererIsCompatible(rendererKey, "restaurant", "restaurant.v2", 2),
      true,
    );
    assert.equal(
      rendererIsCompatible(rendererKey, "gym", "restaurant.v2", 2),
      false,
    );
  }
  assert.equal(rendererIsCompatible("unknown", "restaurant", "restaurant.v2", 2), false);
  assert.equal(rendererIsCompatible("restaurant-modern-v1", "restaurant", "unknown.v1", 1), false);
  assert.equal(rendererPublicationIsAllowed("restaurant-modern-v1", "gym"), false);
  assert.equal(rendererOnboardingIsAllowed("restaurant-modern-v1", "gym"), false);
});

test("catalog exposes three Restaurant templates and zero Gym templates", () => {
  assert.equal(
    compatibleTemplateCatalog("restaurant", "restaurant.v2", 2, restaurantCatalog).length,
    3,
  );
  assert.deepEqual(
    compatibleTemplateCatalog("gym", "gym.v1", 1, restaurantCatalog),
    [],
  );
  assert.throws(
    () => compatibleTemplateCatalog("unknown", "unknown.v1", 1, restaurantCatalog),
    UnknownIndustryError,
  );
});
