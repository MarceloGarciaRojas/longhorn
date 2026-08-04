import assert from "node:assert/strict";
import test from "node:test";
import { rendererIsCompatible } from "../../src/content/renderer-manifest";
import {
  migrateRestaurantV1ToV2,
  validateRestaurantV2Content,
} from "../../src/content/restaurant-v2-schema";
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
  assert.equal(rendererIsCompatible("restaurant-classic-v2", "restaurant.v2", 2), true);
  assert.equal(rendererIsCompatible("restaurant-modern-v1", "restaurant.v2", 2), true);
  assert.equal(rendererIsCompatible("../../arbitrary", "restaurant.v2", 2), false);
  assert.equal(rendererIsCompatible("restaurant-modern-v1", "restaurant.v1", 1), false);
});
