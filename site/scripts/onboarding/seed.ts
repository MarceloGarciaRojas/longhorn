import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

import { onboardingContentChecksum } from "../../src/onboarding/restaurant-onboarding-schema";
import { validateRestaurantV2Content } from "../../src/content/restaurant-v2-schema";
import { assertSafeResetTarget, readDatabaseUrl } from "../../src/db/config";
import { createDatabasePool } from "../../src/db/pool";
import { SYNTHETIC_DATA } from "../db/seed";

const PREFIX = "onboarding-seed-";
const statuses = [
  "received",
  "waiting_information",
  "preparing",
  "internal_review",
  "waiting_client_approval",
  "ready_to_publish",
  "published",
  "paused",
] as const;

const checklist = [
  ["company_profile_complete", "Perfil empresarial", "business", true, "system", true],
  ["client_account_active", "Cuenta cliente activa", "account", true, "system", true],
  ["membership_active", "Membresía activa", "account", true, "system", false],
  ["plan_assigned", "Plan asignado", "setup", true, "system", false],
  ["site_created", "Sitio creado", "setup", true, "system", true],
  ["template_assigned", "Plantilla asignada", "setup", true, "system", false],
  ["business_identity_complete", "Identidad del negocio", "content", true, "client", true],
  ["hero_complete", "Portada completa", "content", true, "client", true],
  ["about_complete", "Historia completa", "content", true, "client", true],
  ["menu_complete", "Menú completo", "content", true, "client", true],
  ["hours_complete", "Horarios completos", "content", true, "client", true],
  ["contact_complete", "Contacto completo", "content", true, "client", true],
  ["social_complete", "Redes revisadas", "content", false, "client", true],
  ["seo_complete", "SEO completo", "content", true, "client", true],
  ["media_ready", "Imágenes listas", "media", true, "system", true],
  ["draft_generated", "Borrador generado", "review", true, "system", true],
  ["internal_review_complete", "Revisión nexi completa", "review", true, "admin", true],
  ["client_approval_valid", "Aprobación vigente", "approval", true, "system", true],
  ["domain_or_subdomain_ready", "Dirección preparada", "publication", true, "system", true],
  ["publication_ready", "Listo para publicar", "publication", true, "system", false],
  ["publication_verified", "Publicación verificada", "publication", true, "system", true],
] as const;

function stableUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${
    hex.slice(17, 20)
  }-${hex.slice(20)}`;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function contentFor(index: number) {
  const categoryId = stableUuid(`${PREFIX}${index}:category`);
  const itemId = stableUuid(`${PREFIX}${index}:item`);
  return validateRestaurantV2Content(
    {
      identity: {
        business_name: `Restaurante Seed ${index + 1}`,
        short_description: "Contenido sintético para escenarios de onboarding.",
        tagline: "Sabores ficticios de temporada",
      },
      hero: {
        headline: `Restaurante Seed ${index + 1}`,
        subheadline: "Escenario reproducible local y CI.",
        primary_cta_label: "Ver carta",
        primary_cta_type: "menu",
        primary_cta_target: "#menu",
        media: null,
      },
      about: {
        title: "Historia sintética",
        description: "Este contenido no representa a una persona ni empresa real.",
      },
      menu: {
        section_title: "Carta de prueba",
        categories: [
          { id: categoryId, name: "Principales", description: "", order: 0 },
        ],
        items: [
          {
            id: itemId,
            category_id: categoryId,
            name: "Plato de prueba",
            description: "Preparación completamente ficticia.",
            price_text: "$9.900",
            availability: true,
            order: 0,
            media: null,
          },
        ],
      },
      hours: [
        "monday","tuesday","wednesday","thursday","friday","saturday","sunday",
      ].map((day, dayIndex) => ({
        day,
        is_open: dayIndex === 0,
        opening_time: dayIndex === 0 ? "12:00" : "",
        closing_time: dayIndex === 0 ? "20:00" : "",
        note: "",
      })),
      contact: {
        public_email: `seed-${index + 1}@example.invalid`,
        public_phone: "+56900000000",
        whatsapp_phone: "",
        address_line: "Dirección Ficticia 123",
        city: "Santiago",
        map_url: "",
      },
      social: {
        instagram_url: "",
        facebook_url: "",
        tiktok_url: "",
      },
      seo: {
        title: `Restaurante Seed ${index + 1}`,
        description: "Sitio sintético del catálogo de pruebas de onboarding nexi.",
      },
      footer: {
        legal_name: "",
        copyright_text: `Restaurante Seed ${index + 1}`,
      },
    },
    "publication",
  );
}

function answersFor(index: number, complete: boolean) {
  const content = contentFor(index);
  return {
    company: {
      businessName: content.identity.business_name,
      tagline: complete ? content.identity.tagline : "",
      shortDescription: complete ? content.identity.short_description : "",
      legalName: "",
    },
    objectives: {
      primaryGoal: complete ? "Presentar el restaurante" : "",
      targetAudience: complete ? "Público ficticio" : "",
      desiredTone: complete ? "Cercano" : "",
      primaryCallToAction: {
        label: complete ? "Ver carta" : "",
        type: "menu",
        target: complete ? "#menu" : "",
      },
    },
    about: {
      title: complete ? content.about.title : "",
      description: complete ? content.about.description : "",
    },
    menu: {
      sectionTitle: content.menu.section_title,
      categories: complete
        ? content.menu.categories.map((entry) => ({
            id: entry.id,
            name: entry.name,
            description: entry.description,
            order: entry.order,
          }))
        : [],
      items: complete
        ? content.menu.items.map((entry) => ({
            id: entry.id,
            categoryId: entry.category_id,
            name: entry.name,
            description: entry.description,
            priceText: entry.price_text,
            availability: entry.availability,
            order: entry.order,
            media: null,
          }))
        : [],
    },
    hours: content.hours.map((entry) => ({
      day: entry.day,
      isOpen: complete && entry.is_open,
      openingTime: complete ? entry.opening_time : "",
      closingTime: complete ? entry.closing_time : "",
      note: entry.note,
    })),
    contact: {
      publicEmail: complete ? content.contact.public_email : "",
      publicPhone: complete ? content.contact.public_phone : "",
      whatsappPhone: "",
      address: complete ? content.contact.address_line : "",
      city: complete ? content.contact.city : "",
      mapUrl: "",
    },
    social: { instagram: "", facebook: "", tiktok: "" },
    seo: {
      title: complete ? content.seo.title : "",
      description: complete ? content.seo.description : "",
    },
    media: { hero: null },
  };
}

async function insertIntakes(client: PoolClient): Promise<void> {
  const scenarios = [
    ["public_form", "submitted", "restaurant", true],
    ["whatsapp", "submitted", "restaurant", true],
    ["public_form", "submitted", "clinic", false],
    ["manual", "accepted", "restaurant", true],
    ["referral", "rejected", "restaurant", true],
  ] as const;
  for (const [index, scenario] of scenarios.entries()) {
    const id = stableUuid(`${PREFIX}intake:${index}`);
    const [source, status, category, supported] = scenario;
    await client.query(
      `INSERT INTO public.onboarding_intake_requests(
         id,source,status,business_name,business_category,contact_name,
         contact_email_normalized,preferred_contact_method,
         current_digital_presence,primary_goal,short_notes,supported_category,
         idempotency_key,request_fingerprint,reviewed_at,rejected_at,
         rejection_reason_code
       ) VALUES(
         $1,$2,$3,$4,$5,'Contacto Seed',$6,'email','Presencia sintética',
         'Validar onboarding','Datos ficticios',$7,$8,$9,
         CASE WHEN $3 IN ('accepted','rejected') THEN transaction_timestamp() END,
         CASE WHEN $3='rejected' THEN transaction_timestamp() END,
         CASE WHEN $3='rejected' THEN 'not_selected' END
       ) ON CONFLICT(id) DO NOTHING`,
      [
        id,source,status,`Solicitud Seed ${index + 1}`,category,
        `intake-seed-${index + 1}@example.invalid`,supported,
        stableUuid(`${PREFIX}intake-key:${index}`),
        fingerprint(`${PREFIX}intake:${index}`),
      ],
    );
  }
}

async function insertCases(client: PoolClient): Promise<void> {
  const plan = await client.query<{ id: string }>(
    `SELECT id FROM public.tenant_plan_assignments
     WHERE tenant_id=$1 AND status='active'`,
    [SYNTHETIC_DATA.tenantB.id],
  );
  if (!plan.rows[0]) {
    throw new Error("Base synthetic tenant plan is required before onboarding seed");
  }
  for (const [index, status] of statuses.entries()) {
    const siteId = stableUuid(`${PREFIX}site:${index}`);
    const caseId = stableUuid(`${PREFIX}case:${index}`);
    const conversationId = stableUuid(`${PREFIX}conversation:${index}`);
    const intakeId = stableUuid(`${PREFIX}case-intake:${index}`);
    const siteStatus = status === "published" ? "active" : "preparing";
    await client.query(
      `INSERT INTO public.onboarding_intake_requests(
         id,source,status,business_name,business_category,contact_name,
         contact_email_normalized,preferred_contact_method,
         current_digital_presence,primary_goal,supported_category,
         idempotency_key,request_fingerprint,conversion_status
       ) VALUES(
         $1,'manual','converted',$2,'restaurant','Contacto Seed',$3,'email',
         'Presencia sintética','Validar caso',true,$4,$5,'completed'
       ) ON CONFLICT(id) DO NOTHING`,
      [
        intakeId,
        `Restaurante Seed ${index + 1}`,
        `case-seed-${index + 1}@example.invalid`,
        stableUuid(`${PREFIX}case-intake-key:${index}`),
        fingerprint(`${PREFIX}case-intake:${index}`),
      ],
    );
    await client.query(
      `INSERT INTO public.sites(
         id,tenant_id,display_name,slug,status,creation_idempotency_key
       ) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,
      [
        siteId,SYNTHETIC_DATA.tenantB.id,
        `Sitio Restaurante Seed ${index + 1}`,`${PREFIX}${index + 1}`,
        siteStatus,stableUuid(`${PREFIX}site-key:${index}`),
      ],
    );
    await client.query(
      `INSERT INTO public.site_domains(
         id,tenant_id,site_id,hostname,domain_type,status,is_primary,
         verification_status,verified_at,activated_at
       ) VALUES($1,$2,$3,$4,'nexi_subdomain','active',true,'verified',
         transaction_timestamp(),transaction_timestamp())
       ON CONFLICT(id) DO NOTHING`,
      [
        stableUuid(`${PREFIX}domain:${index}`),
        SYNTHETIC_DATA.tenantB.id,siteId,`${PREFIX}${index + 1}.nexi.local`,
      ],
    );
    await client.query(
      `INSERT INTO public.site_template_assignments(
         id,tenant_id,site_id,template_version_id,schema_key,schema_version,
         status,assigned_by_user_id,idempotency_key
       ) VALUES($1,$2,$3,$4,'restaurant.v2',2,'active',$5,$6)
       ON CONFLICT(id) DO NOTHING`,
      [
        stableUuid(`${PREFIX}assignment:${index}`),
        SYNTHETIC_DATA.tenantB.id,siteId,
        SYNTHETIC_DATA.templateRestaurantV2.id,SYNTHETIC_DATA.userAdmin.id,
        stableUuid(`${PREFIX}assignment-key:${index}`),
      ],
    );
    await client.query(
      `INSERT INTO public.support_conversations(
         id,tenant_id,site_id,subject,category,status,priority,
         created_by_user_id,idempotency_key
       ) VALUES($1,$2,$3,$4,'other','awaiting_nexi','normal',$5,$6)
       ON CONFLICT(id) DO NOTHING`,
      [
        conversationId,SYNTHETIC_DATA.tenantB.id,siteId,
        `Onboarding Seed ${index + 1}`,SYNTHETIC_DATA.userAdmin.id,
        stableUuid(`${PREFIX}conversation-key:${index}`),
      ],
    );
    await client.query(
      `INSERT INTO public.onboarding_cases(
         id,tenant_id,site_id,intake_request_id,primary_client_user_id,
         assigned_admin_user_id,status,previous_operational_status,priority,
         industry_key,onboarding_schema_key,onboarding_schema_version,current_step,
         target_template_version_id,target_plan_assignment_id,
         linked_conversation_id,idempotency_key
       ) VALUES(
         $1,$2,$3,$4,$5,$6,$7,
         CASE WHEN $7='paused' THEN 'preparing' END,'normal','restaurant',
         'restaurant_onboarding.v1',1,
         CASE
           WHEN $7 IN ('internal_review') THEN 'nexi_review'
           WHEN $7='waiting_client_approval' THEN 'client_approval'
           WHEN $7 IN ('ready_to_publish','published') THEN 'publication'
           ELSE 'content'
         END,$8,$9,$10,$11
       ) ON CONFLICT(id) DO NOTHING`,
      [
        caseId,SYNTHETIC_DATA.tenantB.id,siteId,intakeId,
        SYNTHETIC_DATA.userB.id,SYNTHETIC_DATA.userAdmin.id,status,
        SYNTHETIC_DATA.templateRestaurantV2.id,plan.rows[0].id,conversationId,
        stableUuid(`${PREFIX}case-key:${index}`),
      ],
    );
    await client.query(
      `UPDATE public.onboarding_intake_requests SET
         converted_tenant_id=$2,converted_site_id=$3,converted_case_id=$4,
         converted_at=transaction_timestamp()
       WHERE id=$1 AND converted_case_id IS NULL`,
      [intakeId,SYNTHETIC_DATA.tenantB.id,siteId,caseId],
    );
    for (const [order, item] of checklist.entries()) {
      const [key,name,category,required,source,visible] = item;
      const setupComplete = order <= 5 || key === "domain_or_subdomain_ready";
      const contentComplete = index >= 3 && order >= 6 && order <= 13;
      const reviewComplete = index >= 4 && ["media_ready","draft_generated","internal_review_complete"].includes(key);
      const approvalComplete = index >= 5 && key === "client_approval_valid";
      const readyComplete = index >= 5 && key === "publication_ready";
      const publishedComplete = index >= 6 && key === "publication_verified";
      const complete = setupComplete || contentComplete || reviewComplete ||
        approvalComplete || readyComplete || publishedComplete;
      await client.query(
        `INSERT INTO public.onboarding_checklist_items(
           id,onboarding_case_id,tenant_id,item_key,display_name,category,
           status,required,source,client_visible,display_order,
           completed_at,completed_by_user_id
         ) VALUES(
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
           CASE WHEN $7='completed' THEN transaction_timestamp() END,
           CASE WHEN $7='completed' THEN $12::uuid END
         ) ON CONFLICT(onboarding_case_id,item_key) DO NOTHING`,
        [
          stableUuid(`${PREFIX}checklist:${index}:${key}`),
          caseId,SYNTHETIC_DATA.tenantB.id,key,name,category,
          complete ? "completed" : "pending",required,source,visible,order + 1,
          SYNTHETIC_DATA.userAdmin.id,
        ],
      );
    }
    await client.query(
      `INSERT INTO public.onboarding_state_history(
         onboarding_case_id,tenant_id,from_status,to_status,actor_user_id,
         correlation_id,reason_code
       ) SELECT $1,$2,NULL,$3,$4,$5,'synthetic_seed'
       WHERE NOT EXISTS(
         SELECT 1 FROM public.onboarding_state_history
         WHERE onboarding_case_id=$1
       )`,
      [
        caseId,SYNTHETIC_DATA.tenantB.id,status,SYNTHETIC_DATA.userAdmin.id,
        `${PREFIX}${index}`,
      ],
    );
    if (index >= 2) {
      const complete = index >= 3;
      await client.query(
        `INSERT INTO public.onboarding_answers(
           id,onboarding_case_id,tenant_id,schema_key,schema_version,answers,
           completion_state,updated_by_user_id,last_idempotency_key
         ) VALUES(
           $1,$2,$3,'restaurant_onboarding.v1',1,$4::jsonb,$5,$6,$7
         ) ON CONFLICT(onboarding_case_id) DO NOTHING`,
        [
          stableUuid(`${PREFIX}answers:${index}`),caseId,
          SYNTHETIC_DATA.tenantB.id,JSON.stringify(answersFor(index, complete)),
          complete ? "submitted" : "draft",SYNTHETIC_DATA.userB.id,
          stableUuid(`${PREFIX}answers-key:${index}`),
        ],
      );
    }
    if (index >= 3) {
      const draftId = stableUuid(`${PREFIX}draft:${index}`);
      const content = contentFor(index);
      await client.query(
        `INSERT INTO public.site_content_drafts(
           id,tenant_id,site_id,schema_key,schema_version,content,revision,
           created_by_user_id,updated_by_user_id,last_idempotency_key
         ) VALUES($1,$2,$3,'restaurant.v2',2,$4::jsonb,1,$5,$5,$6)
         ON CONFLICT(site_id) DO NOTHING`,
        [
          draftId,SYNTHETIC_DATA.tenantB.id,siteId,JSON.stringify(content),
          SYNTHETIC_DATA.userAdmin.id,stableUuid(`${PREFIX}draft-key:${index}`),
        ],
      );
      if (index >= 4) {
        const checksum = onboardingContentChecksum({
          siteId,
          draftRevision: 1,
          templateVersionId: SYNTHETIC_DATA.templateRestaurantV2.id,
          schemaKey: "restaurant.v2",
          schemaVersion: 2,
          content,
        });
        await client.query(
          `INSERT INTO public.onboarding_client_approvals(
             id,onboarding_case_id,tenant_id,site_id,draft_revision,
             template_version_id,schema_key,schema_version,content_checksum,
             status,idempotency_key,decided_at,decided_by_user_id
           ) VALUES(
             $1,$2,$3,$4,1,$5,'restaurant.v2',2,$6,$7,$8,
             CASE WHEN $7='approved' THEN transaction_timestamp() END,
             CASE WHEN $7='approved' THEN $9::uuid END
           ) ON CONFLICT(id) DO NOTHING`,
          [
            stableUuid(`${PREFIX}approval:${index}`),caseId,
            SYNTHETIC_DATA.tenantB.id,siteId,
            SYNTHETIC_DATA.templateRestaurantV2.id,checksum,
            index >= 5 ? "approved" : "pending",
            stableUuid(`${PREFIX}approval-key:${index}`),
            SYNTHETIC_DATA.userB.id,
          ],
        );
      }
      if (index === 6) {
        const publicationId = stableUuid(`${PREFIX}publication:${index}`);
        await client.query(
          `INSERT INTO public.site_content_publications(
             id,tenant_id,site_id,template_version_id,schema_key,schema_version,
             content_snapshot,publication_number,published_by_user_id,idempotency_key
           ) VALUES($1,$2,$3,$4,'restaurant.v2',2,$5::jsonb,1,$6,$7)
           ON CONFLICT(id) DO NOTHING`,
          [
            publicationId,SYNTHETIC_DATA.tenantB.id,siteId,
            SYNTHETIC_DATA.templateRestaurantV2.id,JSON.stringify(content),
            SYNTHETIC_DATA.userAdmin.id,
            stableUuid(`${PREFIX}publication-key:${index}`),
          ],
        );
        await client.query(
          `UPDATE public.sites SET current_publication_id=$2,status='active'
           WHERE id=$1 AND current_publication_id IS NULL`,
          [siteId,publicationId],
        );
        await client.query(
          `UPDATE public.onboarding_cases SET publication_id=$2,
             published_at=COALESCE(published_at,transaction_timestamp()),
             published_by_user_id=$3,
             verification_result='{"public_state":"published"}'::jsonb,
             verification_timestamp=COALESCE(
               verification_timestamp,transaction_timestamp()
             )
           WHERE id=$1 AND publication_id IS NULL`,
          [caseId,publicationId,SYNTHETIC_DATA.userAdmin.id],
        );
      }
    }
    await client.query(
      `UPDATE public.onboarding_cases SET
         status=$2,
         previous_operational_status=CASE WHEN $2='paused' THEN 'preparing' ELSE NULL END,
         paused_at=CASE WHEN $2='paused' THEN transaction_timestamp() ELSE NULL END
       WHERE id=$1`,
      [caseId,status],
    );
  }
}

export async function seedOnboardingScenarios(
  connectionString = readDatabaseUrl("migration"),
): Promise<void> {
  assertSafeResetTarget(connectionString);
  const pool = createDatabasePool({
    connectionString,
    applicationName: "nexi-onboarding-seed",
    maxConnections: 1,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await insertIntakes(client);
    await insertCases(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export { PREFIX as ONBOARDING_SEED_PREFIX };
