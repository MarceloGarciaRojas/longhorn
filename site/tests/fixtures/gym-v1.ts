import type { GymAppearanceVariant, GymContentV1 } from "../../src/content/types";

export const GYM_FIXTURE_IDS = Object.freeze({
  logo: "91000000-0000-4000-8000-000000000001",
  hero: "91000000-0000-4000-8000-000000000002",
  class: "91000000-0000-4000-8000-000000000003",
  trainerMedia: "91000000-0000-4000-8000-000000000004",
  facility: "91000000-0000-4000-8000-000000000005",
  gallery: "91000000-0000-4000-8000-000000000006",
  pillar: "92000000-0000-4000-8000-000000000001",
  category: "92000000-0000-4000-8000-000000000002",
  classEntry: "92000000-0000-4000-8000-000000000003",
  trainer: "92000000-0000-4000-8000-000000000004",
  schedule: "92000000-0000-4000-8000-000000000005",
  plan: "92000000-0000-4000-8000-000000000006",
  facilityEntry: "92000000-0000-4000-8000-000000000007",
  galleryEntry: "92000000-0000-4000-8000-000000000008",
  social: "92000000-0000-4000-8000-000000000009",
});

function usage(assetId: string, altText: string) {
  return { assetId, altText, decorative: false } as const;
}

export function completeGymV1Fixture(): GymContentV1 {
  return {
    identity: {
      business_name: "Nexo Fuerza Ficticio",
      descriptor: "Entrenamiento funcional para avanzar con método",
      logo: usage(GYM_FIXTURE_IDS.logo, "Logotipo del gimnasio ficticio"),
    },
    hero: {
      headline: "Encuentra tu próximo nivel",
      subheadline: "Clases guiadas, fuerza y comunidad en un solo lugar.",
      primary_cta_label: "Solicitar clase de prueba",
      primary_cta_channel: "contact",
      media: usage(GYM_FIXTURE_IDS.hero, "Personas en un entrenamiento ficticio"),
    },
    method: {
      title: "Un método que progresa contigo",
      description: "Evaluamos, entrenamos y ajustamos cada ciclo.",
      pillars: [{
        id: GYM_FIXTURE_IDS.pillar,
        title: "Progresión",
        description: "Sesiones adaptadas a tu experiencia.",
        order: 0,
      }],
    },
    class_categories: [{
      id: GYM_FIXTURE_IDS.category,
      name: "Entrenamiento",
      order: 0,
    }],
    classes: [{
      id: GYM_FIXTURE_IDS.classEntry,
      category_id: GYM_FIXTURE_IDS.category,
      name: "Fuerza total",
      description: "Trabajo técnico y progresivo de fuerza.",
      intensity: "high",
      duration_minutes: 60,
      visible: true,
      trial_cta_visible: true,
      order: 0,
      media: usage(GYM_FIXTURE_IDS.class, "Clase de fuerza total"),
    }],
    schedule: [{
      id: GYM_FIXTURE_IDS.schedule,
      class_id: GYM_FIXTURE_IDS.classEntry,
      trainer_id: GYM_FIXTURE_IDS.trainer,
      day: "monday",
      start_time: "18:30",
      duration_minutes: 60,
      informational_capacity: 16,
      visible: true,
      order: 0,
    }],
    trainers: [{
      id: GYM_FIXTURE_IDS.trainer,
      name: "Camila Soto",
      specialty: "Fuerza y movilidad",
      description: "Entrenadora certificada con foco en técnica segura.",
      visible: true,
      order: 0,
      media: usage(GYM_FIXTURE_IDS.trainerMedia, "Entrenadora Camila Soto"),
    }],
    plans: [{
      id: GYM_FIXTURE_IDS.plan,
      name: "Plan Base",
      price_text: "$29.990",
      periodicity: "monthly",
      benefits: ["Acceso a clases", "Evaluación inicial"],
      featured: true,
      visible: true,
      order: 0,
    }],
    facilities: [{
      id: GYM_FIXTURE_IDS.facilityEntry,
      title: "Zona de fuerza",
      description: "Equipamiento para entrenamiento funcional.",
      visible: true,
      order: 0,
      media: usage(GYM_FIXTURE_IDS.facility, "Zona de fuerza del gimnasio"),
    }],
    gallery: [{
      id: GYM_FIXTURE_IDS.galleryEntry,
      visible: true,
      order: 0,
      media: usage(GYM_FIXTURE_IDS.gallery, "Vista interior del gimnasio ficticio"),
    }],
    location: {
      address_line: "Av. Ejemplo 123",
      city: "Santiago",
      directions: "A dos cuadras del metro.",
      map_url: "https://maps.example.com/nexo-fuerza-ficticio",
    },
    hours: [
      {
        day: "monday",
        is_open: true,
        opening_time: "06:30",
        closing_time: "22:00",
        note: "",
      },
      {
        day: "saturday",
        is_open: true,
        opening_time: "09:00",
        closing_time: "14:00",
        note: "Horario reducido",
      },
    ],
    contact: {
      public_email: "hola@nexofuerza.example",
      public_phone: "+56 2 2345 6789",
      whatsapp_phone: "+56 9 8765 4321",
      social: [{
        id: GYM_FIXTURE_IDS.social,
        network: "instagram",
        url: "https://instagram.com/nexofuerzaficticio",
        visible: true,
        order: 0,
      }],
    },
    seo: {
      title: "Nexo Fuerza Ficticio | Entrenamiento funcional",
      description: "Clases de fuerza y entrenamiento funcional en Santiago.",
    },
    appearance: {
      variant: "volt",
      hero_layout: "left",
      method_layout: "right",
      title_scale: "impact",
      media_density: "immersive",
      class_columns: 3,
      spacing: "cinematic",
    },
  };
}

export function minimumGymV1Fixture(): GymContentV1 {
  const fixture = completeGymV1Fixture();
  fixture.identity.logo = null;
  fixture.hero.media = null;
  fixture.classes[0].media = null;
  fixture.schedule[0].trainer_id = null;
  fixture.schedule[0].informational_capacity = null;
  fixture.trainers = [];
  fixture.facilities = [];
  fixture.gallery = [];
  fixture.contact.social = [];
  fixture.contact.whatsapp_phone = "";
  fixture.location.directions = "";
  fixture.location.map_url = "";
  fixture.plans[0].price_text = "";
  fixture.plans[0].featured = false;
  fixture.hours = [fixture.hours[0]];
  return fixture;
}

export function gymV1WithoutMediaFixture(): GymContentV1 {
  const fixture = completeGymV1Fixture();
  fixture.identity.logo = null;
  fixture.hero.media = null;
  fixture.classes.forEach((entry) => { entry.media = null; });
  fixture.trainers.forEach((entry) => { entry.media = null; });
  fixture.facilities.forEach((entry) => { entry.media = null; });
  fixture.gallery = [];
  return fixture;
}

export function gymV1VariantFixture(variant: GymAppearanceVariant): GymContentV1 {
  const fixture = completeGymV1Fixture();
  fixture.appearance.variant = variant;
  return fixture;
}

export function longGymV1Fixture(): GymContentV1 {
  const fixture = completeGymV1Fixture();
  fixture.method.description = "Entrenamiento progresivo y seguro. ".repeat(30).trim();
  fixture.classes[0].description = "Trabajo técnico de fuerza. ".repeat(18).trim();
  fixture.trainers[0].description = "Acompañamiento profesional. ".repeat(16).trim();
  return fixture;
}
