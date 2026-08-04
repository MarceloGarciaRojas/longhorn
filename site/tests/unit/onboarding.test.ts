import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { loadOnboardingConfig } from "../../src/onboarding/config";
import {
  emptyRestaurantOnboardingAnswers,
  onboardingContentChecksum,
  OnboardingSchemaError,
  transformOnboardingToRestaurantV2,
  validateRestaurantOnboardingAnswers,
} from "../../src/onboarding/restaurant-onboarding-schema";
import {
  parsePublicIntake,
  PublicOnboardingError,
  publicIntakeFingerprint,
} from "../../src/onboarding/public-service.server";

function publicParams(overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    idempotency_key: randomUUID(),
    business_name: "  Restaurante   Horizonte  ",
    business_category: "restaurant",
    contact_name: "Persona Ficticia",
    contact_email: "  PERSONA@EXAMPLE.INVALID ",
    contact_phone: "+56 9 1234 5678",
    preferred_contact_method: "email",
    city: "Valparaíso",
    current_digital_presence: "Solo redes sociales",
    primary_goal: "Mostrar la carta y el horario",
    short_notes: "Datos completamente sintéticos",
    privacy_acknowledgement: "accepted",
    ...overrides,
  });
}

test("onboarding configuration is local/test only and restaurant-only", () => {
  assert.equal(loadOnboardingConfig({ APP_ENV: "test" }).publicFormEnabled, true);
  assert.equal(
    loadOnboardingConfig({ APP_ENV: "production" }).publicFormEnabled,
    false,
  );
  assert.throws(
    () =>
      loadOnboardingConfig({
        APP_ENV: "production",
        ONBOARDING_PUBLIC_FORM_ENABLED: "true",
      }),
    /restricted/,
  );
  assert.throws(
    () =>
      loadOnboardingConfig({
        APP_ENV: "test",
        ONBOARDING_SUPPORTED_INDUSTRIES: "restaurant,cafe",
      }),
    /Only restaurant/,
  );
});

test("public intake normalizes values without accepting code or hidden fields", () => {
  const parsed = parsePublicIntake(publicParams());
  assert.equal(parsed.businessName, "Restaurante Horizonte");
  assert.equal(parsed.contactEmail, "persona@example.invalid");
  assert.equal(parsed.contactPhone, "+56912345678");
  assert.match(publicIntakeFingerprint(parsed), /^[a-f0-9]{64}$/);

  assert.throws(
    () => parsePublicIntake(publicParams({ primary_goal: "<script>x</script>" })),
    (error: unknown) =>
      error instanceof PublicOnboardingError && error.code === "invalid",
  );
  assert.throws(
    () => parsePublicIntake(publicParams({ privacy_acknowledgement: "no" })),
    PublicOnboardingError,
  );
});

test("restaurant_onboarding.v1 rejects unknown, executable and oversized data", () => {
  const empty = emptyRestaurantOnboardingAnswers({
    businessName: "Restaurante Ficticio",
  });
  assert.throws(
    () =>
      validateRestaurantOnboardingAnswers(
        { ...empty, unexpected: true },
        "draft",
      ),
    (error: unknown) =>
      error instanceof OnboardingSchemaError &&
      error.reason === "unknown",
  );
  assert.throws(
    () =>
      validateRestaurantOnboardingAnswers(
        {
          ...empty,
          company: { ...empty.company, tagline: "javascript:alert(1)" },
        },
        "draft",
      ),
    OnboardingSchemaError,
  );
});

test("the restaurant.v2 transformation and revision checksum are deterministic", () => {
  const categoryId = randomUUID();
  const itemId = randomUUID();
  const draft = emptyRestaurantOnboardingAnswers({
    businessName: "Restaurante Ficticio",
    email: "contacto@example.invalid",
    phone: "+56912345678",
    city: "Santiago",
  });
  const answers = validateRestaurantOnboardingAnswers(
    {
      ...draft,
      company: {
        ...draft.company,
        tagline: "Cocina de estación",
        shortDescription: "Sabores locales preparados cada día.",
      },
      objectives: {
        primaryGoal: "Presentar el restaurante",
        targetAudience: "Familias de la zona",
        desiredTone: "Cercano",
        primaryCallToAction: {
          label: "Ver carta",
          type: "menu",
          target: "#menu",
        },
      },
      about: {
        title: "Nuestra historia",
        description: "Un restaurante ficticio creado para pruebas automatizadas.",
      },
      menu: {
        sectionTitle: "Nuestra carta",
        categories: [
          { id: categoryId, name: "Fondos", description: "", order: 0 },
        ],
        items: [
          {
            id: itemId,
            categoryId,
            name: "Plato de prueba",
            description: "Preparación totalmente sintética.",
            priceText: "$9.900",
            availability: true,
            order: 0,
            media: null,
          },
        ],
      },
      hours: draft.hours.map((entry) =>
        entry.day === "monday"
          ? {
              ...entry,
              isOpen: true,
              openingTime: "12:00",
              closingTime: "20:00",
            }
          : entry,
      ),
      contact: {
        ...draft.contact,
        address: "Calle Ficticia 123",
      },
      seo: {
        title: "Restaurante Ficticio",
        description: "Carta y horarios del restaurante ficticio de pruebas.",
      },
    },
    "submitted",
  );
  const first = transformOnboardingToRestaurantV2(answers, "publication");
  const second = transformOnboardingToRestaurantV2(answers, "publication");
  assert.deepEqual(first, second);
  assert.equal(first.menu.categories[0].id, categoryId);
  assert.equal(first.menu.items[0].id, itemId);
  const base = {
    siteId: randomUUID(),
    draftRevision: 1,
    templateVersionId: randomUUID(),
    schemaKey: "restaurant.v2",
    schemaVersion: 2,
    content: first,
  };
  assert.equal(
    onboardingContentChecksum(base),
    onboardingContentChecksum(structuredClone(base)),
  );
  assert.notEqual(
    onboardingContentChecksum(base),
    onboardingContentChecksum({ ...base, draftRevision: 2 }),
  );
});
