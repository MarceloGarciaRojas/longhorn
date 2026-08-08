import { createDatabasePool } from "../../src/db/pool";
import {
  emptyRestaurantContent,
  validateRestaurantContent,
} from "../../src/content/restaurant-schema";
import {
  RESTAURANT_EDITORIAL_RENDERER_KEY,
  RESTAURANT_EDITORIAL_TEMPLATE_KEY,
  type RestaurantContent,
} from "../../src/content/types";

export const SYNTHETIC_DATA = {
  tenantA: {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "cobre-norte-demo",
    displayName: "Cobre Norte Ficticia",
  },
  tenantB: {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "laguna-taller-demo",
    displayName: "Taller Laguna Ficticio",
  },
  tenantC: {
    id: "33333333-3333-4333-8333-333333333333",
    slug: "valle-sur-demo",
    displayName: "Valle Sur Ficticio",
  },
  tenantSuspended: {
    id: "44444444-4444-4444-8444-444444444444",
    slug: "empresa-suspendida-demo",
    displayName: "Empresa Suspendida Ficticia",
  },
  tenantDisabledMembership: {
    id: "55555555-5555-4555-8555-555555555555",
    slug: "acceso-detenido-demo",
    displayName: "Acceso Detenido Ficticio",
  },
  userA: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    email: "ana.demo@example.invalid",
    displayName: "Ana Demostración",
  },
  userB: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    email: "bruno.demo@example.invalid",
    displayName: "Bruno Demostración",
  },
  userAdmin: {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    email: "admin.nexi@example.invalid",
    displayName: "Administración nexi",
  },
  userMulti: {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    email: "multi.demo@example.invalid",
    displayName: "Cuenta Multiempresa",
  },
  userSuspended: {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    email: "suspendida.demo@example.invalid",
    displayName: "Cuenta Empresa Suspendida",
  },
  userDisabledMembership: {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    email: "acceso.detenido@example.invalid",
    displayName: "Cuenta Acceso Detenido",
  },
  membershipA: {
    id: "a1111111-1111-4111-8111-111111111111",
  },
  membershipB: {
    id: "b2222222-2222-4222-8222-222222222222",
  },
  membershipMultiA: {
    id: "e1111111-1111-4111-8111-111111111111",
  },
  membershipMultiB: {
    id: "e2222222-2222-4222-8222-222222222222",
  },
  membershipSuspended: {
    id: "e3333333-3333-4333-8333-333333333333",
  },
  membershipDisabled: {
    id: "e4444444-4444-4444-8444-444444444444",
  },
  identityA: {
    id: "d1111111-1111-4111-8111-111111111111",
    providerSubject: "test-client-a",
  },
  identityB: {
    id: "d2222222-2222-4222-8222-222222222222",
    providerSubject: "test-client-b",
  },
  identityAdmin: {
    id: "d3333333-3333-4333-8333-333333333333",
    providerSubject: "test-admin",
  },
  identityMulti: {
    id: "d4444444-4444-4444-8444-444444444444",
    providerSubject: "test-client-multi",
  },
  identitySuspended: {
    id: "d5555555-5555-4555-8555-555555555555",
    providerSubject: "test-client-suspended",
  },
  identityDisabledMembership: {
    id: "d6666666-6666-4666-8666-666666666666",
    providerSubject: "test-client-disabled-membership",
  },
  planEssential: {
    id: "61111111-1111-4111-8111-111111111111",
    code: "essential",
    displayName: "Esencial",
  },
  planPro: {
    id: "62222222-2222-4222-8222-222222222222",
    code: "pro",
    displayName: "Pro",
  },
  siteA: {
    id: "71111111-1111-4111-8111-111111111111",
    slug: "cobre-norte",
    displayName: "Sitio Cobre Norte",
  },
  siteB: {
    id: "72222222-2222-4222-8222-222222222222",
    slug: "taller-laguna",
    displayName: "Sitio Taller Laguna",
  },
  siteA2: {
    id: "73333333-3333-4333-8333-333333333333",
    slug: "cobre-secundario",
    displayName: "Sitio Cobre Secundario",
  },
  siteB2: {
    id: "74444444-4444-4444-8444-444444444444",
    slug: "laguna-secundario",
    displayName: "Sitio Laguna Secundario",
  },
  siteSuspended: {
    id: "75555555-5555-4555-8555-555555555555",
    slug: "restaurante-suspendido",
    displayName: "Restaurante Suspendido Ficticio",
  },
  templateRestaurant: {
    id: "a8111111-1111-4111-8111-111111111111",
    key: "restaurant-classic",
    displayName: "Restaurante Estación",
  },
  templateRestaurantV1: {
    id: "a8222222-2222-4222-8222-222222222222",
    version: 1,
    rendererKey: "restaurant-classic-v1",
  },
  templateRestaurantV2: {
    id: "a8666666-6666-4666-8666-666666666666",
    version: 5,
    rendererKey: "restaurant-classic-v2",
  },
  templateRestaurantModern: {
    id: "a8777777-7777-4777-8777-777777777777",
    key: "restaurant-modern",
    displayName: "Restaurante Horizonte",
  },
  templateRestaurantModernV1: {
    id: "a8888888-8888-4888-8888-888888888888",
    version: 1,
    rendererKey: "restaurant-modern-v1",
  },
  templateRestaurantEditorial: {
    id: "a8999999-9999-4999-8999-999999999999",
    key: RESTAURANT_EDITORIAL_TEMPLATE_KEY,
    displayName: "Restaurante Editorial",
  },
  templateRestaurantEditorialV1: {
    id: "a8aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    version: 1,
    rendererKey: RESTAURANT_EDITORIAL_RENDERER_KEY,
  },
} as const;

export function syntheticRestaurantContent(input: {
  businessName: string;
  city: string;
  variant: string;
  categoryId: string;
  itemId: string;
}): RestaurantContent {
  return validateRestaurantContent({
    identity: {
      business_name: input.businessName,
      short_description: `Restaurante ficticio de prueba ${input.variant}.`,
      tagline: "Cocina cercana y de temporada",
    },
    hero: {
      headline: `Sabores ficticios de ${input.city}.`,
      subheadline: "Una propuesta demostrativa creada exclusivamente para validar nexi.",
      primary_cta_label: "Explorar la carta",
      primary_cta_type: "menu",
      primary_cta_target: "#menu",
      hero_media_reference: "restaurant-hero",
    },
    about: {
      title: "Una historia creada para pruebas.",
      description: "Este texto es sintético y permite comprobar la separación entre contenido, plantilla y tenant.",
    },
    menu: {
      section_title: "Carta demostrativa",
      categories: [{
        id: input.categoryId,
        name: "Preparaciones ficticias",
        description: "Selección utilizada únicamente en pruebas automatizadas.",
        order: 0,
      }],
      items: [{
        id: input.itemId,
        category_id: input.categoryId,
        name: `Plato demostrativo ${input.variant}`,
        description: "Ingredientes ficticios, presentación sintética y disponibilidad controlada.",
        price_text: "$0 demostrativo",
        availability: true,
        order: 0,
        media_reference: "restaurant-dish-a",
      }],
    },
    hours: [
      { day: "monday", is_open: false, opening_time: "", closing_time: "", note: "Cerrado" },
      { day: "tuesday", is_open: true, opening_time: "12:00", closing_time: "20:00", note: "" },
      { day: "wednesday", is_open: true, opening_time: "12:00", closing_time: "20:00", note: "" },
      { day: "thursday", is_open: true, opening_time: "12:00", closing_time: "20:00", note: "" },
      { day: "friday", is_open: true, opening_time: "12:00", closing_time: "21:00", note: "" },
      { day: "saturday", is_open: true, opening_time: "13:00", closing_time: "21:00", note: "" },
      { day: "sunday", is_open: false, opening_time: "", closing_time: "", note: "Cerrado" },
    ],
    contact: {
      public_email: `${input.variant.toLowerCase()}@example.invalid`,
      public_phone: "+56 9 0000 0001",
      whatsapp_phone: "",
      address_line: "Avenida Demostración 101",
      city: input.city,
      map_url: `https://maps.example.invalid/${input.variant.toLowerCase()}`,
    },
    social: {
      instagram_url: `https://social.example.invalid/${input.variant.toLowerCase()}`,
      facebook_url: "",
      tiktok_url: "",
    },
    seo: {
      title: `${input.businessName} | Sitio ficticio`,
      description: `Contenido sintético ${input.variant} para validar publicación multi-tenant.`,
    },
    footer: {
      legal_name: `${input.businessName} Demostración`,
      copyright_text: "Sitio ficticio para pruebas de nexi.",
    },
  }, "publication");
}

export async function seedSyntheticData(
  connectionString: string,
): Promise<void> {
  const pool = createDatabasePool({
    connectionString,
    applicationName: "nexi-seed",
    maxConnections: 1,
  });
  const client = await pool.connect();
  const data = SYNTHETIC_DATA;

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO public.tenants (id, slug, display_name, status)
       VALUES
         ($1, $2, $3, 'active'),
         ($4, $5, $6, 'active'),
         ($7, $8, $9, 'active'),
         ($10, $11, $12, 'suspended'),
         ($13, $14, $15, 'active')
       ON CONFLICT (id) DO UPDATE
       SET slug = EXCLUDED.slug,
           display_name = EXCLUDED.display_name,
           status = EXCLUDED.status,
           deleted_at = NULL`,
      [
        data.tenantA.id,
        data.tenantA.slug,
        data.tenantA.displayName,
        data.tenantB.id,
        data.tenantB.slug,
        data.tenantB.displayName,
        data.tenantC.id,
        data.tenantC.slug,
        data.tenantC.displayName,
        data.tenantSuspended.id,
        data.tenantSuspended.slug,
        data.tenantSuspended.displayName,
        data.tenantDisabledMembership.id,
        data.tenantDisabledMembership.slug,
        data.tenantDisabledMembership.displayName,
      ],
    );
    await client.query(
      `INSERT INTO public.users (id, email, display_name, status)
       VALUES
         ($1, $2, $3, 'active'),
         ($4, $5, $6, 'active'),
         ($7, $8, $9, 'active'),
         ($10, $11, $12, 'active'),
         ($13, $14, $15, 'active'),
         ($16, $17, $18, 'active')
       ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           display_name = EXCLUDED.display_name,
           status = EXCLUDED.status,
           deleted_at = NULL`,
      [
        data.userA.id,
        data.userA.email,
        data.userA.displayName,
        data.userB.id,
        data.userB.email,
        data.userB.displayName,
        data.userAdmin.id,
        data.userAdmin.email,
        data.userAdmin.displayName,
        data.userMulti.id,
        data.userMulti.email,
        data.userMulti.displayName,
        data.userSuspended.id,
        data.userSuspended.email,
        data.userSuspended.displayName,
        data.userDisabledMembership.id,
        data.userDisabledMembership.email,
        data.userDisabledMembership.displayName,
      ],
    );
    await client.query(
      `INSERT INTO public.tenant_memberships
         (id, tenant_id, user_id, status)
       VALUES
         ($1, $2, $3, 'active'),
         ($4, $5, $6, 'active'),
         ($7, $8, $9, 'active'),
         ($10, $11, $12, 'active'),
         ($13, $14, $15, 'active'),
         ($16, $17, $18, 'disabled')
       ON CONFLICT (id) DO UPDATE
       SET tenant_id = EXCLUDED.tenant_id,
           user_id = EXCLUDED.user_id,
           status = EXCLUDED.status`,
      [
        data.membershipA.id,
        data.tenantA.id,
        data.userA.id,
        data.membershipB.id,
        data.tenantB.id,
        data.userB.id,
        data.membershipMultiA.id,
        data.tenantA.id,
        data.userMulti.id,
        data.membershipMultiB.id,
        data.tenantB.id,
        data.userMulti.id,
        data.membershipSuspended.id,
        data.tenantSuspended.id,
        data.userSuspended.id,
        data.membershipDisabled.id,
        data.tenantDisabledMembership.id,
        data.userDisabledMembership.id,
      ],
    );
    await client.query(
      `INSERT INTO public.auth_identities
         (id, user_id, provider, provider_subject, provider_email)
       VALUES
         ($1, $2, 'test', $3, $4),
         ($5, $6, 'test', $7, $8),
         ($9, $10, 'test', $11, $12),
         ($13, $14, 'test', $15, $16),
         ($17, $18, 'test', $19, $20),
         ($21, $22, 'test', $23, $24)
       ON CONFLICT (id) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           provider = EXCLUDED.provider,
           provider_subject = EXCLUDED.provider_subject,
           provider_email = EXCLUDED.provider_email`,
      [
        data.identityA.id,
        data.userA.id,
        data.identityA.providerSubject,
        data.userA.email,
        data.identityB.id,
        data.userB.id,
        data.identityB.providerSubject,
        data.userB.email,
        data.identityAdmin.id,
        data.userAdmin.id,
        data.identityAdmin.providerSubject,
        data.userAdmin.email,
        data.identityMulti.id,
        data.userMulti.id,
        data.identityMulti.providerSubject,
        data.userMulti.email,
        data.identitySuspended.id,
        data.userSuspended.id,
        data.identitySuspended.providerSubject,
        data.userSuspended.email,
        data.identityDisabledMembership.id,
        data.userDisabledMembership.id,
        data.identityDisabledMembership.providerSubject,
        data.userDisabledMembership.email,
      ],
    );
    await client.query(
      `INSERT INTO public.platform_staff (user_id, role, status)
       VALUES ($1, 'nexi_admin', 'active')
       ON CONFLICT (user_id) DO UPDATE
       SET role = EXCLUDED.role,
           status = EXCLUDED.status`,
      [data.userAdmin.id],
    );
    await client.query(
      `INSERT INTO public.user_profiles (user_id, phone, locale)
       VALUES
         ($1, '+56911111111', 'es-CL'),
         ($2, '+56922222222', 'es-CL'),
         ($3, NULL, 'es-CL')
       ON CONFLICT (user_id) DO UPDATE
       SET phone = EXCLUDED.phone,
           locale = EXCLUDED.locale`,
      [data.userA.id, data.userB.id, data.userMulti.id],
    );
    await client.query(
      `INSERT INTO public.tenant_profiles (
         tenant_id, legal_name, contact_email, contact_phone, description
       )
       VALUES
         ($1, 'Cobre Norte Ficticia SpA', $2, '+56911111111', 'Empresa ficticia para pruebas de nexi.'),
         ($3, 'Taller Laguna Ficticio SpA', $4, '+56922222222', 'Taller ficticio para validar aislamiento.'),
         ($5, NULL, NULL, NULL, NULL)
       ON CONFLICT (tenant_id) DO UPDATE
       SET legal_name = EXCLUDED.legal_name,
           contact_email = EXCLUDED.contact_email,
           contact_phone = EXCLUDED.contact_phone,
           description = EXCLUDED.description`,
      [
        data.tenantA.id,
        data.userA.email,
        data.tenantB.id,
        data.userB.email,
        data.tenantC.id,
      ],
    );
    await client.query(
      `INSERT INTO public.plans (id, code, display_name, description, status)
       VALUES
         ($1, $2, $3, 'Presencia digital administrable con funciones base y soporte nexi.', 'active'),
         ($4, $5, $6, 'Mayor capacidad, dominio propio gestionado por nexi y preparación futura.', 'active')
       ON CONFLICT (id) DO UPDATE
       SET code = EXCLUDED.code,
           display_name = EXCLUDED.display_name,
           description = EXCLUDED.description,
           status = EXCLUDED.status`,
      [
        data.planEssential.id,
        data.planEssential.code,
        data.planEssential.displayName,
        data.planPro.id,
        data.planPro.code,
        data.planPro.displayName,
      ],
    );
    await client.query(
      `INSERT INTO public.plan_features (
         id, plan_id, feature_key, display_name, detail, display_order
       )
       VALUES
         ('81111111-1111-4111-8111-111111111111', $1, 'managed_site', 'Sitio autogestionable', NULL, 10),
         ('81111111-1111-4111-8111-111111111112', $1, 'nexi_subdomain', 'Subdominio nexi', NULL, 20),
         ('81111111-1111-4111-8111-111111111113', $1, 'nexi_support', 'Soporte nexi', NULL, 30),
         ('82222222-2222-4222-8222-222222222221', $2, 'managed_site', 'Sitio autogestionable', NULL, 10),
         ('82222222-2222-4222-8222-222222222222', $2, 'custom_domain_request', 'Dominio propio gestionado por nexi', NULL, 20),
         ('82222222-2222-4222-8222-222222222223', $2, 'future_store', 'Preparación para futuras funciones de tienda online', 'La tienda online todavía no está operativa.', 30),
         ('82222222-2222-4222-8222-222222222224', $2, 'nexi_support', 'Soporte nexi', NULL, 40)
       ON CONFLICT (id) DO UPDATE
       SET plan_id = EXCLUDED.plan_id,
           feature_key = EXCLUDED.feature_key,
           display_name = EXCLUDED.display_name,
           detail = EXCLUDED.detail,
           display_order = EXCLUDED.display_order,
           status = 'active'`,
      [data.planEssential.id, data.planPro.id],
    );
    await client.query(
      `INSERT INTO public.tenant_plan_assignments (
         id, tenant_id, plan_id, status, starts_at, reference_date
       )
       VALUES
         ('91111111-1111-4111-8111-111111111111', $1, $2, 'active', '2026-07-01T00:00:00Z', '2026-08-01'),
         ('92222222-2222-4222-8222-222222222222', $3, $4, 'active', '2026-07-01T00:00:00Z', '2026-08-01')
       ON CONFLICT (tenant_id) DO UPDATE
       SET plan_id = EXCLUDED.plan_id,
           status = EXCLUDED.status,
           starts_at = EXCLUDED.starts_at,
           reference_date = EXCLUDED.reference_date`,
      [
        data.tenantA.id,
        data.planEssential.id,
        data.tenantB.id,
        data.planPro.id,
      ],
    );
    await client.query(
      `INSERT INTO public.plan_media_capabilities(
         plan_id,media_library_enabled,media_asset_limit,media_storage_bytes,
         media_upload_max_bytes,media_allowed_mime_types
       ) VALUES
         ($1,true,12,52428800,10485760,ARRAY['image/jpeg','image/png','image/webp']),
         ($2,true,40,209715200,10485760,ARRAY['image/jpeg','image/png','image/webp'])
       ON CONFLICT(plan_id) DO UPDATE SET
         media_library_enabled=EXCLUDED.media_library_enabled,
         media_asset_limit=EXCLUDED.media_asset_limit,
         media_storage_bytes=EXCLUDED.media_storage_bytes,
         media_upload_max_bytes=EXCLUDED.media_upload_max_bytes,
         media_allowed_mime_types=EXCLUDED.media_allowed_mime_types`,
      [data.planEssential.id, data.planPro.id],
    );
    await client.query(
      `INSERT INTO public.sites (
         id, tenant_id, display_name, slug, status
       )
       VALUES
         ($1, $2, $3, $4, 'preparing'),
         ($5, $6, $7, $8, 'active'),
         ($9, $2, $10, $11, 'active'),
         ($12, $6, $13, $14, 'active'),
         ($15, $16, $17, $18, 'active')
       ON CONFLICT (id) DO UPDATE
       SET tenant_id = EXCLUDED.tenant_id,
           display_name = EXCLUDED.display_name,
           slug = EXCLUDED.slug,
           status = EXCLUDED.status,
           deleted_at = NULL`,
      [
        data.siteA.id,
        data.tenantA.id,
        data.siteA.displayName,
        data.siteA.slug,
        data.siteB.id,
        data.tenantB.id,
        data.siteB.displayName,
        data.siteB.slug,
        data.siteA2.id,
        data.siteA2.displayName,
        data.siteA2.slug,
        data.siteB2.id,
        data.siteB2.displayName,
        data.siteB2.slug,
        data.siteSuspended.id,
        data.tenantSuspended.id,
        data.siteSuspended.displayName,
        data.siteSuspended.slug,
      ],
    );
    const contentA = syntheticRestaurantContent({
      businessName: "Mesa Cobre Ficticia",
      city: "Ciudad Cobre Ficticia",
      variant: "Cobre",
      categoryId: "a9111111-1111-4111-8111-111111111111",
      itemId: "aa111111-1111-4111-8111-111111111111",
    });
    const contentB = syntheticRestaurantContent({
      businessName: "Fogón Laguna Ficticio",
      city: "Ciudad Laguna Ficticia",
      variant: "Laguna",
      categoryId: "a9222222-2222-4222-8222-222222222222",
      itemId: "aa222222-2222-4222-8222-222222222222",
    });
    const contentBPreview = validateRestaurantContent({
      ...contentB,
      hero: {
        ...contentB.hero,
        headline: "Borrador privado de Laguna.",
        subheadline: "Este cambio solo debe aparecer en la vista previa protegida.",
      },
    }, "publication");
    const contentSuspended = syntheticRestaurantContent({
      businessName: "Mesa Suspendida Ficticia",
      city: "Ciudad Suspendida Ficticia",
      variant: "Suspendida",
      categoryId: "a9333333-3333-4333-8333-333333333333",
      itemId: "aa333333-3333-4333-8333-333333333333",
    });
    const emptyA = emptyRestaurantContent({
      businessName: "Mesa Cobre Ficticia",
    });
    await client.query(
      `INSERT INTO public.templates(
         id,key,display_name,industry_key,status,description
       ) VALUES($1,$2,$3,'restaurant','active',
         'Plantilla profesional de restaurante adaptada de la referencia Brote y Brasa.')
       ON CONFLICT(id) DO UPDATE SET
         key=EXCLUDED.key,display_name=EXCLUDED.display_name,
         industry_key='restaurant',status='active',description=EXCLUDED.description`,
      [
        data.templateRestaurant.id,
        data.templateRestaurant.key,
        data.templateRestaurant.displayName,
      ],
    );
    await client.query(
      `INSERT INTO public.templates(
         id,key,display_name,industry_key,status,description
       ) VALUES($1,$2,$3,'restaurant','active',
         'Composición contemporánea para el mismo contenido estructurado de restaurante.')
       ON CONFLICT(id) DO UPDATE SET key=EXCLUDED.key,
         display_name=EXCLUDED.display_name,industry_key='restaurant',
         status='active',description=EXCLUDED.description`,
      [
        data.templateRestaurantModern.id,
        data.templateRestaurantModern.key,
        data.templateRestaurantModern.displayName,
      ],
    );
    await client.query(
      `INSERT INTO public.templates(
         id,key,display_name,industry_key,status,description
       ) VALUES($1,$2,$3,'restaurant','active',
         'Composición editorial para previsualizar el mismo contenido estructurado de restaurante.')
       ON CONFLICT(id) DO UPDATE SET key=EXCLUDED.key,
         display_name=EXCLUDED.display_name,industry_key='restaurant',
         status='active',description=EXCLUDED.description`,
      [
        data.templateRestaurantEditorial.id,
        data.templateRestaurantEditorial.key,
        data.templateRestaurantEditorial.displayName,
      ],
    );
    await client.query(
      `INSERT INTO public.template_versions(
         id,template_id,version,renderer_key,content_schema_key,
         minimum_schema_version,maximum_schema_version,status,released_at,preview_key
       ) VALUES($1,$2,$3,$4,'restaurant.v1',1,1,'active','2026-07-25T00:00:00Z','restaurant-classic')
       ON CONFLICT(id) DO UPDATE SET
         template_id=EXCLUDED.template_id,version=EXCLUDED.version,
         renderer_key=EXCLUDED.renderer_key,content_schema_key='restaurant.v1',
         minimum_schema_version=1,maximum_schema_version=1,status='active',
         preview_key='restaurant-classic'`,
      [
        data.templateRestaurantV1.id,
        data.templateRestaurant.id,
        data.templateRestaurantV1.version,
        data.templateRestaurantV1.rendererKey,
      ],
    );
    await client.query(
      `INSERT INTO public.template_versions(
         id,template_id,version,renderer_key,content_schema_key,
         minimum_schema_version,maximum_schema_version,status,released_at,preview_key
       ) VALUES
         ($1,$2,$3,$4,'restaurant.v2',2,2,'active','2026-07-26T00:00:00Z','restaurant-classic'),
         ($5,$6,$7,$8,'restaurant.v2',2,2,'active','2026-07-26T00:00:00Z','restaurant-modern')
       ON CONFLICT(id) DO UPDATE SET
         template_id=EXCLUDED.template_id,version=EXCLUDED.version,
         renderer_key=EXCLUDED.renderer_key,content_schema_key='restaurant.v2',
         minimum_schema_version=2,maximum_schema_version=2,status='active',
         preview_key=EXCLUDED.preview_key`,
      [
        data.templateRestaurantV2.id,
        data.templateRestaurant.id,
        data.templateRestaurantV2.version,
        data.templateRestaurantV2.rendererKey,
        data.templateRestaurantModernV1.id,
        data.templateRestaurantModern.id,
        data.templateRestaurantModernV1.version,
        data.templateRestaurantModernV1.rendererKey,
      ],
    );
    await client.query(
      `INSERT INTO public.template_versions(
         id,template_id,version,renderer_key,content_schema_key,
         minimum_schema_version,maximum_schema_version,status,released_at,preview_key
       ) VALUES($1,$2,$3,$4,'restaurant.v2',2,2,'active',NULL,'restaurant-editorial')
       ON CONFLICT(id) DO UPDATE SET
         template_id=EXCLUDED.template_id,version=EXCLUDED.version,
         renderer_key=EXCLUDED.renderer_key,content_schema_key='restaurant.v2',
         minimum_schema_version=2,maximum_schema_version=2,status='active',
         released_at=NULL,preview_key='restaurant-editorial'`,
      [
        data.templateRestaurantEditorialV1.id,
        data.templateRestaurantEditorial.id,
        data.templateRestaurantEditorialV1.version,
        data.templateRestaurantEditorialV1.rendererKey,
      ],
    );
    await client.query(
      `INSERT INTO public.site_template_assignments(
         id,tenant_id,site_id,template_version_id,schema_key,schema_version,
         assigned_by_user_id,idempotency_key
       ) VALUES
          ('ab111111-1111-4111-8111-111111111111',$1,$2,$10,'restaurant.v1',1,$9,
          'ab111111-1111-4111-8111-111111111112'),
          ('ab222222-2222-4222-8222-222222222222',$3,$4,$10,'restaurant.v1',1,$9,
          'ab222222-2222-4222-8222-222222222223'),
          ('ab333333-3333-4333-8333-333333333333',$1,$5,$10,'restaurant.v1',1,$9,
          'ab333333-3333-4333-8333-333333333334'),
          ('ab444444-4444-4444-8444-444444444444',$3,$6,$10,'restaurant.v1',1,$9,
          'ab444444-4444-4444-8444-444444444445'),
          ('ab555555-5555-4555-8555-555555555555',$7,$8,$10,'restaurant.v1',1,$9,
          'ab555555-5555-4555-8555-555555555556')
       ON CONFLICT(site_id) DO UPDATE SET
         template_version_id=EXCLUDED.template_version_id,
         schema_key='restaurant.v1',schema_version=1,status='active'`,
      [
        data.tenantA.id,
        data.siteA.id,
        data.tenantB.id,
        data.siteB.id,
        data.siteA2.id,
        data.siteB2.id,
        data.tenantSuspended.id,
        data.siteSuspended.id,
        data.userAdmin.id,
        data.templateRestaurantV1.id,
      ],
    );
    await client.query(
      `INSERT INTO public.site_content_drafts(
         id,tenant_id,site_id,schema_key,schema_version,content,revision,
         created_by_user_id,updated_by_user_id,last_idempotency_key
       ) VALUES
         ('ac111111-1111-4111-8111-111111111111',$1,$2,'restaurant.v1',1,$7::jsonb,1,$6,$6,
          'ac111111-1111-4111-8111-111111111112'),
         ('ac222222-2222-4222-8222-222222222222',$3,$4,'restaurant.v1',1,$8::jsonb,2,$5,$5,
          'ac222222-2222-4222-8222-222222222223')
       ON CONFLICT(site_id) DO UPDATE SET
         content=EXCLUDED.content,revision=EXCLUDED.revision,
         updated_by_user_id=EXCLUDED.updated_by_user_id,
         last_idempotency_key=EXCLUDED.last_idempotency_key`,
      [
        data.tenantA.id,
        data.siteA.id,
        data.tenantB.id,
        data.siteB.id,
        data.userB.id,
        data.userAdmin.id,
        JSON.stringify(emptyA),
        JSON.stringify(contentBPreview),
      ],
    );
    await client.query(
      `UPDATE public.tenants SET status='active' WHERE id=$1`,
      [data.tenantSuspended.id],
    );
    await client.query(
      `INSERT INTO public.site_content_publications(
         id,tenant_id,site_id,template_version_id,schema_key,schema_version,
         content_snapshot,publication_number,published_by_user_id,idempotency_key
       ) VALUES
         ('ad111111-1111-4111-8111-111111111111',$1,$2,$11,'restaurant.v1',1,$7::jsonb,1,$6,
          'ad111111-1111-4111-8111-111111111112'),
         ('ad222222-2222-4222-8222-222222222222',$4,$3,$11,'restaurant.v1',1,$8::jsonb,1,$6,
          'ad222222-2222-4222-8222-222222222223'),
         ('ad333333-3333-4333-8333-333333333333',$1,$5,$11,'restaurant.v1',1,$7::jsonb,1,$6,
          'ad333333-3333-4333-8333-333333333334'),
         ('ad444444-4444-4444-8444-444444444444',$9,$10,$11,'restaurant.v1',1,$12::jsonb,1,$6,
          'ad444444-4444-4444-8444-444444444445')
       ON CONFLICT(id) DO NOTHING`,
      [
        data.tenantB.id,
        data.siteB.id,
        data.siteA2.id,
        data.tenantA.id,
        data.siteB2.id,
        data.userAdmin.id,
        JSON.stringify(contentB),
        JSON.stringify(contentA),
        data.tenantSuspended.id,
        data.siteSuspended.id,
        data.templateRestaurantV1.id,
        JSON.stringify(contentSuspended),
      ],
    );
    await client.query(
      `UPDATE public.sites SET current_publication_id=CASE id
         WHEN $1::uuid THEN 'ad111111-1111-4111-8111-111111111111'::uuid
         WHEN $2::uuid THEN 'ad222222-2222-4222-8222-222222222222'::uuid
         WHEN $3::uuid THEN 'ad333333-3333-4333-8333-333333333333'::uuid
         WHEN $4::uuid THEN 'ad444444-4444-4444-8444-444444444444'::uuid
       END,version=version+1
       WHERE id IN($1,$2,$3,$4)`,
      [data.siteB.id, data.siteA2.id, data.siteB2.id, data.siteSuspended.id],
    );
    await client.query(
      `UPDATE public.sites SET status='suspended' WHERE id=$1`,
      [data.siteSuspended.id],
    );
    await client.query(
      `UPDATE public.tenants SET status='suspended' WHERE id=$1`,
      [data.tenantSuspended.id],
    );
    await client.query(
      `INSERT INTO public.site_deletion_requests (
         id, tenant_id, site_id, requested_by_user_id, reason, status,
         previous_site_status,
         grace_hours, requested_at, eligible_at, idempotency_key
       ) VALUES (
         'a7111111-1111-4111-8111-111111111111', $1, $2, $3,
         'Solicitud ficticia para validar el periodo de espera.', 'pending',
         'preparing',
         48, '2026-07-25T12:00:00Z', '2026-07-27T12:00:00Z',
         'a7111111-1111-4111-8111-111111111112'
       )
       ON CONFLICT (id) DO UPDATE SET
         status='pending', reason=EXCLUDED.reason, canceled_at=NULL,
         reviewed_at=NULL, reviewed_by_user_id=NULL, review_note=NULL,
         approved_at=NULL, rejected_at=NULL, executed_at=NULL`,
      [data.tenantA.id, data.siteA.id, data.userA.id],
    );
    await client.query(
      `INSERT INTO public.site_domain_requests (
         id, tenant_id, site_id, requested_by_user_id, request_type,
         desired_domain, client_notes, status, idempotency_key
       ) VALUES (
         'a7222222-2222-4222-8222-222222222222', $1, $2, $3,
         'register_new', 'taller-laguna-ejemplo.cl',
         'Solicitud ficticia sin datos sensibles.', 'submitted',
         'a7222222-2222-4222-8222-222222222223'
       )
       ON CONFLICT (id) DO UPDATE SET
         status='submitted', assigned_to_user_id=NULL, reviewed_at=NULL,
         resolved_at=NULL, internal_note=NULL`,
      [data.tenantB.id, data.siteB.id, data.userB.id],
    );
    await client.query(
      `INSERT INTO public.site_domains (
         id, tenant_id, site_id, hostname, domain_type, status,
         is_primary, verification_status, activated_at
       ) VALUES (
         'a7333333-3333-4333-8333-333333333333', $1, $2,
         'taller-laguna.nexi.cl', 'nexi_subdomain', 'active',
         true, 'verified', '2026-07-20T12:00:00Z'
       )
       ON CONFLICT (id) DO UPDATE SET
         hostname=EXCLUDED.hostname, status='active', is_primary=true,
         verification_status='verified'`,
      [data.tenantB.id, data.siteB.id],
    );
    await client.query(
      `INSERT INTO public.support_conversations (
         id, tenant_id, site_id, subject, category, status, priority,
         created_by_user_id, last_message_at, closed_at, idempotency_key
       ) VALUES
         ('b7111111-1111-4111-8111-111111111111', $1, $2,
          'Consulta ficticia sobre el sitio', 'site', 'awaiting_client',
          'normal', $3, '2026-07-25T14:00:00Z', NULL,
          'b7111111-1111-4111-8111-111111111112'),
         ('b7222222-2222-4222-8222-222222222222', $4, $5,
          'Conversación ficticia cerrada', 'general', 'closed',
          'normal', $6, '2026-07-24T14:00:00Z', '2026-07-24T14:00:00Z',
          'b7222222-2222-4222-8222-222222222223')
       ON CONFLICT (id) DO UPDATE SET
         status=EXCLUDED.status, priority=EXCLUDED.priority,
         last_message_at=EXCLUDED.last_message_at, closed_at=EXCLUDED.closed_at`,
      [
        data.tenantA.id, data.siteA.id, data.userA.id,
        data.tenantB.id, data.siteB.id, data.userB.id,
      ],
    );
    await client.query(
      `INSERT INTO public.support_conversation_participants (
         tenant_id, conversation_id, user_id, participant_scope, last_read_at
       ) VALUES
         ($1, 'b7111111-1111-4111-8111-111111111111', $2, 'client_admin',
          '2026-07-25T13:30:00Z'),
         ($3, 'b7222222-2222-4222-8222-222222222222', $4, 'client_admin',
          '2026-07-24T14:00:00Z')
       ON CONFLICT (conversation_id, user_id) DO UPDATE
       SET last_read_at=EXCLUDED.last_read_at`,
      [data.tenantA.id, data.userA.id, data.tenantB.id, data.userB.id],
    );
    await client.query(
      `INSERT INTO public.support_messages (
         id, tenant_id, conversation_id, sender_user_id, sender_scope, body,
         idempotency_key, created_at
       ) VALUES
         ('c7111111-1111-4111-8111-111111111111', $1,
          'b7111111-1111-4111-8111-111111111111', $2, 'client_admin',
          'Este es un mensaje ficticio del cliente.',
          'c7111111-1111-4111-8111-111111111112', '2026-07-25T13:00:00Z'),
         ('c7111111-1111-4111-8111-111111111113', $1,
          'b7111111-1111-4111-8111-111111111111', $3, 'nexi_admin',
          'Esta es una respuesta ficticia de soporte nexi.',
          'c7111111-1111-4111-8111-111111111114', '2026-07-25T14:00:00Z')
       ON CONFLICT (id) DO NOTHING`,
      [data.tenantA.id, data.userA.id, data.userAdmin.id],
    );
    await client.query(
      `INSERT INTO public.notification_outbox (
         id, tenant_id, recipient_user_id, template_key, payload,
         status, deduplication_key
       ) VALUES (
         'd7111111-1111-4111-8111-111111111111', $1, $2,
         'new_support_message',
         '{"path":"/cuenta/mensajes/b7111111-1111-4111-8111-111111111111"}',
         'pending', 'seed-message-c7111111-1111-4111-8111-111111111113'
       )
       ON CONFLICT (id) DO UPDATE SET status='pending', attempts=0,
         sent_at=NULL, failed_at=NULL, last_error_code=NULL`,
      [data.tenantA.id, data.userA.id],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
