import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { AuthSession } from "@/src/auth/types";
import { loadAuthConfig } from "@/src/auth/config";
import { createIdentityProvider } from "@/src/auth/identity-provider.server";
import {
  completeInvitation,
  failInvitation,
  listInvitations,
  prepareInvitationResend,
  reserveInvitation,
} from "@/src/admin/admin-repository.server";
import type { AdminActor } from "@/src/admin/types";
import {
  isValidSlug,
  normalizeSearch,
  normalizeSlug,
  requestFingerprint,
} from "@/src/admin/validation";
import { rendererIsCompatible } from "@/src/content/renderer-manifest";
import { validateRestaurantV2Content } from "@/src/content/restaurant-v2-schema";
import { rendererOnboardingIsAllowed } from "@/src/content/template-capabilities";
import {
  publishContentTransaction,
  resolvePublicSite,
} from "@/src/content/service.server";
import { withAdminOperation, withClientOperation } from "@/src/operations/contexts.server";
import {
  validateRestaurantOnboardingAnswers,
  transformOnboardingToRestaurantV2,
  onboardingContentChecksum,
} from "./restaurant-onboarding-schema";
import {
  ONBOARDING_CASE_STATUSES,
  ONBOARDING_INDUSTRIES,
  ONBOARDING_SOURCES,
  type ClientOnboardingWorkspace,
  type IntakeRecord,
  type OnboardingCaseRecord,
  type OnboardingCaseStatus,
  type OnboardingDraftResult,
  type OnboardingIndustry,
  type OnboardingPriority,
  type OnboardingSource,
  type RestaurantOnboardingAnswersV1,
} from "./types";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class OnboardingOperationError extends Error {
  constructor(
    readonly code:
      | "invalid"
      | "denied"
      | "not_found"
      | "conflict"
      | "unsupported"
      | "incomplete"
      | "provider",
    readonly field?: string,
  ) {
    super(code);
    this.name = "OnboardingOperationError";
  }
}

function uuid(value: FormDataEntryValue | null): string {
  const result = String(value || "").trim().toLowerCase();
  if (!UUID.test(result)) throw new OnboardingOperationError("invalid");
  return result;
}

function optionalUuid(value: FormDataEntryValue | null): string | null {
  const result = String(value || "").trim();
  return result ? uuid(result) : null;
}

function clean(
  value: FormDataEntryValue | null,
  minimum: number,
  maximum: number,
  optional = false,
): string | null {
  const result = String(value || "").trim().replace(/\s+/g, " ");
  if (optional && !result) return null;
  if (
    result.length < minimum ||
    result.length > maximum ||
    /<[^>]*>|\bjavascript\s*:|\bon\w+\s*=/i.test(result)
  ) {
    throw new OnboardingOperationError("invalid");
  }
  return result;
}

function integer(value: FormDataEntryValue | null): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new OnboardingOperationError("invalid");
  }
  return result;
}

function deterministicUuid(value: string): string {
  const bytes = createHash("sha256").update(value, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function actor(session: Readonly<AuthSession>): AdminActor {
  return { sessionId: session.sessionId, userId: session.userId };
}

async function audit(
  client: PoolClient,
  input: Readonly<{
    tenantId: string | null;
    action: string;
    resourceType: string;
    resourceId: string;
    correlationId: string;
    previous?: unknown;
    next?: unknown;
    metadata?: Record<string, string | number | boolean | null>;
  }>,
): Promise<void> {
  await client.query(
    `SELECT app_private.onboarding_record_event(
       $1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb
     )`,
    [
      input.tenantId,
      input.action,
      input.resourceType,
      input.resourceId,
      input.correlationId,
      input.previous === undefined ? null : JSON.stringify(input.previous),
      input.next === undefined ? null : JSON.stringify(input.next),
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

function mapError(error: unknown): OnboardingOperationError {
  if (error instanceof OnboardingOperationError) return error;
  const code = (error as { code?: string }).code;
  let mapped: OnboardingOperationError;
  if (code === "42501") {
    mapped = new OnboardingOperationError("denied");
  } else if (code === "23505" || code === "40001") {
    mapped = new OnboardingOperationError("conflict");
  } else if (code === "P0002") {
    mapped = new OnboardingOperationError("not_found");
  } else {
    mapped = new OnboardingOperationError("invalid");
  }
  Object.defineProperty(mapped, "cause", {
    value: error,
    enumerable: false,
  });
  return mapped;
}

const intakeSelect = `
  request.id,request.source,request.status,
  request.business_name AS "businessName",
  request.business_category AS "businessCategory",
  request.contact_name AS "contactName",
  request.contact_email_normalized AS "contactEmail",
  request.contact_phone AS "contactPhone",
  request.preferred_contact_method AS "preferredContactMethod",
  request.city,request.current_digital_presence AS "currentDigitalPresence",
  request.primary_goal AS "primaryGoal",request.short_notes AS "shortNotes",
  request.supported_category AS "supportedCategory",
  request.conversion_status AS "conversionStatus",
  request.version,request.submitted_at AS "submittedAt",
  request.updated_at AS "updatedAt"`;

export async function adminIntakes(
  session: Readonly<AuthSession>,
  input: Readonly<{
    search?: string | null;
    status?: string | null;
    category?: string | null;
    source?: string | null;
    from?: string | null;
    to?: string | null;
    page?: number;
  }> = {},
): Promise<{ items: IntakeRecord[]; total: number; page: number }> {
  const page = Math.max(1, input.page ?? 1);
  const limit = 20;
  const search = normalizeSearch(input.search ?? null);
  const status = input.status && [
    "submitted","reviewing","waiting_information","accepted","rejected",
    "converted","canceled",
  ].includes(input.status) ? input.status : null;
  const category = input.category && ONBOARDING_INDUSTRIES.includes(
    input.category as OnboardingIndustry,
  ) ? input.category : null;
  const source = input.source && ONBOARDING_SOURCES.includes(
    input.source as OnboardingSource,
  ) ? input.source : null;
  const from = input.from && /^\d{4}-\d{2}-\d{2}$/.test(input.from)
    ? input.from
    : null;
  const to = input.to && /^\d{4}-\d{2}-\d{2}$/.test(input.to)
    ? input.to
    : null;
  try {
    return await withAdminOperation(session, "onboarding-intakes", async (client) => {
      const result = await client.query<IntakeRecord & { totalCount: string }>(
        `SELECT ${intakeSelect},count(*) OVER() AS "totalCount"
         FROM public.onboarding_intake_requests request
         WHERE ($1::text IS NULL OR
           request.business_name ILIKE '%'||$1||'%' OR
           request.contact_name ILIKE '%'||$1||'%' OR
           request.contact_email_normalized ILIKE '%'||$1||'%')
           AND ($2::text IS NULL OR request.status=$2)
           AND ($3::text IS NULL OR request.business_category=$3)
           AND ($4::text IS NULL OR request.source=$4)
           AND ($5::date IS NULL OR request.submitted_at >= $5::date)
           AND ($6::date IS NULL OR request.submitted_at < $6::date + 1)
         ORDER BY request.submitted_at DESC,request.id DESC
         LIMIT $7 OFFSET $8`,
        [search,status,category,source,from,to,limit,(page - 1) * limit],
      );
      return {
        items: result.rows,
        total: Number(result.rows[0]?.totalCount ?? 0),
        page,
      };
    });
  } catch (error) {
    throw mapError(error);
  }
}

export async function adminIntake(
  session: Readonly<AuthSession>,
  intakeId: string,
): Promise<IntakeRecord | null> {
  if (!UUID.test(intakeId)) return null;
  try {
    return await withAdminOperation(session, "onboarding-intake", async (client) => {
      const result = await client.query<IntakeRecord>(
        `SELECT ${intakeSelect}
         FROM public.onboarding_intake_requests request WHERE request.id=$1`,
        [intakeId],
      );
      return result.rows[0] ?? null;
    });
  } catch (error) {
    throw mapError(error);
  }
}

export async function adminOnboardingOptions(
  session: Readonly<AuthSession>,
): Promise<{
  plans: Array<{ id: string; name: string }>;
  templates: Array<{ id: string; name: string }>;
  admins: Array<{ id: string; name: string }>;
  tenants: Array<{ id: string; name: string }>;
}> {
  try {
    return await withAdminOperation(session, "onboarding-options", async (client) => {
      const [plans, templates, admins, tenants] = await Promise.all([
        client.query<{ id: string; name: string }>(
          `SELECT id,display_name AS name FROM public.plans
           WHERE status='active' ORDER BY display_name`,
        ),
        client.query<{ id: string; name: string; rendererKey: string }>(
          `SELECT version.id,template.display_name||' v'||version.version AS name,
             version.renderer_key AS "rendererKey"
           FROM public.template_versions version
           JOIN public.templates template ON template.id=version.template_id
           WHERE template.industry_key='restaurant' AND template.status='active'
             AND version.status='active'
             AND version.content_schema_key='restaurant.v2'
             AND version.minimum_schema_version<=2
             AND version.maximum_schema_version>=2
           ORDER BY template.display_name,version.version DESC`,
        ),
        client.query<{ id: string; name: string }>(
          `SELECT id,name FROM app_private.onboarding_list_active_admins()`,
        ),
        client.query<{ id: string; name: string }>(
          `SELECT id,display_name AS name FROM public.tenants
           WHERE status='active' AND deleted_at IS NULL ORDER BY display_name`,
        ),
      ]);
      return {
        plans: plans.rows,
        templates: templates.rows
          .filter((template) =>
            rendererOnboardingIsAllowed(template.rendererKey, "restaurant"),
          )
          .map(({ id, name }) => ({ id, name })),
        admins: admins.rows,
        tenants: tenants.rows,
      };
    });
  } catch (error) {
    throw mapError(error);
  }
}

export async function createManualIntake(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const source = String(form.get("source") || "") as OnboardingSource;
  const category = String(form.get("business_category") || "") as OnboardingIndustry;
  const idempotencyKey = uuid(form.get("idempotency_key"));
  if (
    source === "public_form" ||
    !ONBOARDING_SOURCES.includes(source) ||
    !ONBOARDING_INDUSTRIES.includes(category)
  ) throw new OnboardingOperationError("invalid");
  const businessName = clean(form.get("business_name"), 2, 120)!;
  const contactName = clean(form.get("contact_name"), 2, 120)!;
  const email = String(form.get("contact_email") || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new OnboardingOperationError("invalid");
  }
  const goal = clean(form.get("primary_goal"), 2, 500)!;
  const notes = clean(form.get("short_notes"), 1, 1000, true);
  const phone = clean(form.get("contact_phone"), 7, 25, true);
  const city = clean(form.get("city"), 2, 120, true);
  const internalObservation = clean(
    form.get("internal_observation"),
    2,
    2000,
    true,
  );
  const fingerprint = requestFingerprint([
    source,businessName,category,contactName,email,phone ?? "",city ?? "",
    goal,notes ?? "",internalObservation ?? "",
  ]);
  try {
    return await withAdminOperation(session, correlationId, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.onboarding_intake_requests(
           source,status,business_name,business_category,contact_name,
           contact_email_normalized,contact_phone,preferred_contact_method,city,
           current_digital_presence,primary_goal,short_notes,source_hint,
           supported_category,idempotency_key,request_fingerprint
         ) VALUES($1,'submitted',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,$12,$13,$14)
         ON CONFLICT(idempotency_key) DO NOTHING RETURNING id`,
        [
          source,businessName,category,contactName,email,phone,
          String(form.get("preferred_contact_method") || "email"),
          city,
          String(form.get("current_digital_presence") || "unknown").slice(0, 500),
          goal,notes,
          category === "restaurant",idempotencyKey,fingerprint,
        ],
      );
      let id = inserted.rows[0]?.id;
      if (!id) {
        const replay = await client.query<{ id: string; fingerprint: string }>(
          `SELECT id,request_fingerprint AS fingerprint
           FROM public.onboarding_intake_requests WHERE idempotency_key=$1`,
          [idempotencyKey],
        );
        if (!replay.rows[0] || replay.rows[0].fingerprint !== fingerprint) {
          throw new OnboardingOperationError("conflict");
        }
        id = replay.rows[0].id;
      } else {
        if (internalObservation) {
          await client.query(
            `INSERT INTO public.onboarding_intake_internal_notes(
               intake_request_id,author_user_id,category,note,idempotency_key
             ) VALUES($1,$2,'general',$3,$4)
             ON CONFLICT(intake_request_id,author_user_id,idempotency_key)
             DO NOTHING`,
            [id,session.userId,internalObservation,idempotencyKey],
          );
        }
        await audit(client, {
          tenantId: null,
          action: "onboarding_intake_manual_created",
          resourceType: "onboarding_intake",
          resourceId: id,
          correlationId,
          metadata: { source, supported: category === "restaurant" },
        });
      }
      return id;
    });
  } catch (error) {
    throw mapError(error);
  }
}

export async function adminIntakeInternalNotes(
  session: Readonly<AuthSession>,
  intakeId: string,
): Promise<Array<{
  id: string;
  authorName: string;
  note: string;
  createdAt: Date;
}>> {
  if (!UUID.test(intakeId)) return [];
  try {
    return await withAdminOperation(
      session,
      "onboarding-intake-notes",
      async (client) => {
        const result = await client.query<{
          id: string;
          authorName: string;
          note: string;
          createdAt: Date;
        }>(
          `SELECT note.id,account.display_name AS "authorName",
             note.note,note.created_at AS "createdAt"
           FROM public.onboarding_intake_internal_notes note
           JOIN public.users account ON account.id=note.author_user_id
           WHERE note.intake_request_id=$1 ORDER BY note.created_at DESC`,
          [intakeId],
        );
        return result.rows;
      },
    );
  } catch (error) {
    throw mapError(error);
  }
}

export async function reviewIntake(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const intakeId = uuid(form.get("intake_id"));
  const expectedVersion = integer(form.get("version"));
  const target = String(form.get("target_status") || "");
  if (!["reviewing","waiting_information","accepted","rejected","canceled"].includes(target)) {
    throw new OnboardingOperationError("invalid");
  }
  const reason = clean(form.get("reason"), 2, 500, true);
  if (["waiting_information","rejected","canceled"].includes(target) && !reason) {
    throw new OnboardingOperationError("invalid");
  }
  try {
    return await withAdminOperation(session, correlationId, async (client) => {
      const current = await client.query<{
        status: string; version: number; tenantId: string | null;
      }>(
        `SELECT status,version,converted_tenant_id AS "tenantId"
         FROM public.onboarding_intake_requests WHERE id=$1 FOR UPDATE`,
        [intakeId],
      );
      if (!current.rows[0]) throw new OnboardingOperationError("not_found");
      if (
        current.rows[0].version !== expectedVersion ||
        ["converted","rejected","canceled"].includes(current.rows[0].status)
      ) throw new OnboardingOperationError("conflict");
      await client.query(
        `UPDATE public.onboarding_intake_requests SET
           status=$2,reviewed_at=transaction_timestamp(),
           reviewed_by_user_id=$3,
           rejected_at=CASE WHEN $2='rejected' THEN transaction_timestamp() ELSE rejected_at END,
           rejection_reason_code=CASE WHEN $2='rejected' THEN $4 ELSE NULL END,
           version=version+1 WHERE id=$1`,
        [intakeId,target,session.userId,target === "rejected" ? "not_selected" : null],
      );
      const action = target === "accepted"
        ? "onboarding_intake_accepted"
        : target === "rejected"
          ? "onboarding_intake_rejected"
          : target === "waiting_information"
            ? "onboarding_information_requested"
            : "onboarding_intake_reviewed";
      await audit(client, {
        tenantId: current.rows[0].tenantId,
        action,
        resourceType: "onboarding_intake",
        resourceId: intakeId,
        correlationId,
        previous: { status: current.rows[0].status },
        next: { status: target },
        metadata: reason ? { reason_code: "operator_reason_recorded" } : {},
      });
      return intakeId;
    });
  } catch (error) {
    throw mapError(error);
  }
}

const checklist = [
  ["company_profile_complete","Perfil empresarial","business",true,"system",true],
  ["client_account_active","Cuenta cliente activa","account",true,"system",true],
  ["membership_active","Membresía activa","account",true,"system",false],
  ["plan_assigned","Plan asignado","setup",true,"system",false],
  ["site_created","Sitio creado","setup",true,"system",true],
  ["template_assigned","Plantilla asignada","setup",true,"system",false],
  ["business_identity_complete","Identidad del negocio","content",true,"client",true],
  ["hero_complete","Portada completa","content",true,"client",true],
  ["about_complete","Historia completa","content",true,"client",true],
  ["menu_complete","Menú completo","content",true,"client",true],
  ["hours_complete","Horarios completos","content",true,"client",true],
  ["contact_complete","Contacto completo","content",true,"client",true],
  ["social_complete","Redes revisadas","content",false,"client",true],
  ["seo_complete","SEO completo","content",true,"client",true],
  ["media_ready","Imágenes listas","media",true,"system",true],
  ["draft_generated","Borrador generado","review",true,"system",true],
  ["internal_review_complete","Revisión nexi completa","review",true,"admin",true],
  ["client_approval_valid","Aprobación vigente","approval",true,"system",true],
  ["domain_or_subdomain_ready","Dirección preparada","publication",true,"system",true],
  ["publication_ready","Listo para publicar","publication",true,"system",false],
  ["publication_verified","Publicación verificada","publication",true,"system",true],
] as const;

interface PreparedConversion {
  intakeId: string;
  tenantId: string;
  siteId: string;
  caseId: string;
  contactEmail: string;
  contactName: string;
}

async function prepareConversionResources(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<PreparedConversion> {
  const intakeId = uuid(form.get("intake_id"));
  const conversionKey = uuid(form.get("idempotency_key"));
  const existingTenantId = optionalUuid(form.get("tenant_id"));
  const planId = uuid(form.get("plan_id"));
  const templateVersionId = uuid(form.get("template_version_id"));
  const assignedAdminId = optionalUuid(form.get("assigned_admin_user_id"));
  const priority = String(form.get("priority") || "normal") as OnboardingPriority;
  if (!["normal","high","urgent"].includes(priority)) {
    throw new OnboardingOperationError("invalid");
  }
  try {
    return await withAdminOperation(session, correlationId, async (client) => {
      const request = await client.query<{
        id: string;
        status: string;
        supported: boolean;
        businessName: string;
        category: string;
        contactName: string;
        email: string;
        phone: string | null;
        goal: string;
        tenantId: string | null;
        siteId: string | null;
        caseId: string | null;
      }>(
        `SELECT id,status,supported_category AS supported,
           business_name AS "businessName",business_category AS category,
           contact_name AS "contactName",
           contact_email_normalized AS email,contact_phone AS phone,
           primary_goal AS goal,converted_tenant_id AS "tenantId",
           converted_site_id AS "siteId",converted_case_id AS "caseId"
         FROM public.onboarding_intake_requests WHERE id=$1 FOR UPDATE`,
        [intakeId],
      );
      const intake = request.rows[0];
      if (!intake) throw new OnboardingOperationError("not_found");
      if (!intake.supported || intake.category !== "restaurant") {
        throw new OnboardingOperationError("unsupported");
      }
      if (!["accepted","converted"].includes(intake.status)) {
        throw new OnboardingOperationError("conflict");
      }
      if (intake.caseId && intake.tenantId && intake.siteId) {
        return {
          intakeId,
          tenantId: intake.tenantId,
          siteId: intake.siteId,
          caseId: intake.caseId,
          contactEmail: intake.email,
          contactName: intake.contactName,
        };
      }
      const slugCandidate = normalizeSlug(
        String(form.get("site_slug") || intake.businessName),
      );
      if (!isValidSlug(slugCandidate)) throw new OnboardingOperationError("invalid");
      let tenantId = existingTenantId ?? intake.tenantId;
      if (tenantId) {
        const tenant = await client.query(
          `SELECT 1 FROM public.tenants WHERE id=$1 AND status='active'
           AND deleted_at IS NULL`,
          [tenantId],
        );
        if (!tenant.rowCount) throw new OnboardingOperationError("not_found");
      } else {
        const tenantKey = deterministicUuid(`onboarding:tenant:${intakeId}`);
        const tenantSlug = normalizeSlug(
          String(form.get("tenant_slug") || intake.businessName),
        );
        if (!isValidSlug(tenantSlug)) throw new OnboardingOperationError("invalid");
        const created = await client.query<{ id: string }>(
          `SELECT app_private.admin_create_tenant(
             $1,$2,$3,$4,$5,$6,'America/Santiago','es-CL',$7
           ) AS id`,
          [
            session.sessionId,session.userId,tenantKey,
            requestFingerprint([intakeId,intake.businessName,tenantSlug]),
            intake.businessName,tenantSlug,correlationId,
          ],
        );
        tenantId = created.rows[0].id;
        await client.query(
          `SELECT app_private.admin_set_tenant_status(
             $1,$2,$3,'active','Activación controlada por onboarding',$4
           )`,
          [session.sessionId,session.userId,tenantId,correlationId],
        );
      }
      await client.query(
        `INSERT INTO public.tenant_profiles(
           tenant_id,contact_email,contact_phone,description
         ) VALUES($1,$2,$3,$4)
         ON CONFLICT(tenant_id) DO UPDATE SET
           contact_email=COALESCE(public.tenant_profiles.contact_email,EXCLUDED.contact_email),
           contact_phone=COALESCE(public.tenant_profiles.contact_phone,EXCLUDED.contact_phone),
           description=COALESCE(public.tenant_profiles.description,EXCLUDED.description),
           version=public.tenant_profiles.version+1`,
        [tenantId,intake.email,intake.phone,intake.goal],
      );
      const plan = await client.query(
        `SELECT 1 FROM public.plans WHERE id=$1 AND status='active'`,
        [planId],
      );
      if (!plan.rowCount) throw new OnboardingOperationError("not_found");
      const planAssignmentId = deterministicUuid(`onboarding:plan:${intakeId}`);
      await client.query(
        `INSERT INTO public.tenant_plan_assignments(
           id,tenant_id,plan_id,status,starts_at,reference_date
         ) VALUES($1,$2,$3,'active',transaction_timestamp(),current_date)
         ON CONFLICT(tenant_id) DO UPDATE SET
           plan_id=EXCLUDED.plan_id,status='active',
           starts_at=COALESCE(public.tenant_plan_assignments.starts_at,EXCLUDED.starts_at),
           version=public.tenant_plan_assignments.version+1`,
        [planAssignmentId,tenantId,planId],
      );
      const template = await client.query<{ rendererKey: string }>(
        `SELECT version.renderer_key AS "rendererKey"
         FROM public.template_versions version
         JOIN public.templates template ON template.id=version.template_id
         WHERE version.id=$1 AND version.status='active'
           AND template.status='active' AND template.industry_key='restaurant'
           AND version.content_schema_key='restaurant.v2'
           AND version.minimum_schema_version<=2
           AND version.maximum_schema_version>=2`,
        [templateVersionId],
      );
      if (
        !template.rows[0] ||
        !rendererOnboardingIsAllowed(template.rows[0].rendererKey, "restaurant")
      ) {
        throw new OnboardingOperationError("unsupported");
      }
      const siteId = deterministicUuid(`onboarding:site:${intakeId}`);
      await client.query(
        `INSERT INTO public.sites(
           id,tenant_id,display_name,slug,status,creation_idempotency_key
         ) VALUES($1,$2,$3,$4,'preparing',$5)
         ON CONFLICT(id) DO NOTHING`,
        [siteId,tenantId,`Sitio ${intake.businessName}`,slugCandidate,conversionKey],
      );
      await client.query(
        `INSERT INTO public.site_domains(
           id,tenant_id,site_id,hostname,domain_type,status,is_primary,
           verification_status,verified_at,activated_at
         ) VALUES($1,$2,$3,$4,'nexi_subdomain','active',true,'verified',
           transaction_timestamp(),transaction_timestamp())
         ON CONFLICT(hostname) DO NOTHING`,
        [
          deterministicUuid(`onboarding:domain:${intakeId}`),
          tenantId,siteId,`${slugCandidate}.nexi.local`,
        ],
      );
      await client.query(
        `INSERT INTO public.site_template_assignments(
           id,tenant_id,site_id,template_version_id,schema_key,schema_version,
           status,assigned_by_user_id,idempotency_key
         ) VALUES($1,$2,$3,$4,'restaurant.v2',2,'active',$5,$6)
         ON CONFLICT(site_id) DO NOTHING`,
        [
          deterministicUuid(`onboarding:assignment:${intakeId}`),
          tenantId,siteId,templateVersionId,session.userId,
          deterministicUuid(`onboarding:assignment-key:${intakeId}`),
        ],
      );
      const conversationId = deterministicUuid(`onboarding:conversation:${intakeId}`);
      await client.query(
        `INSERT INTO public.support_conversations(
           id,tenant_id,site_id,subject,category,status,priority,
           created_by_user_id,idempotency_key
         ) VALUES($1,$2,$3,$4,'other','awaiting_nexi',$5,$6,$7)
         ON CONFLICT(id) DO NOTHING`,
        [
          conversationId,tenantId,siteId,`Incorporación · ${intake.businessName}`,
          priority,session.userId,
          deterministicUuid(`onboarding:conversation-key:${intakeId}`),
        ],
      );
      const caseId = deterministicUuid(`onboarding:case:${intakeId}`);
      await client.query(
        `INSERT INTO public.onboarding_cases(
           id,tenant_id,site_id,intake_request_id,assigned_admin_user_id,
           status,priority,industry_key,onboarding_schema_key,
           onboarding_schema_version,current_step,target_template_version_id,
           target_plan_assignment_id,linked_conversation_id,idempotency_key
         ) VALUES(
           $1,$2,$3,$4,$5,'received',$6,'restaurant',
           'restaurant_onboarding.v1',1,'business',$7,$8,$9,$10
         ) ON CONFLICT(intake_request_id) DO NOTHING`,
        [
          caseId,tenantId,siteId,intakeId,assignedAdminId,
          priority,templateVersionId,planAssignmentId,conversationId,
          deterministicUuid(`onboarding:case-key:${intakeId}`),
        ],
      );
      for (const [key,name,category,required,source,clientVisible] of checklist) {
        await client.query(
          `INSERT INTO public.onboarding_checklist_items(
             id,onboarding_case_id,tenant_id,item_key,display_name,category,
             status,required,source,client_visible,display_order
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT(onboarding_case_id,item_key) DO NOTHING`,
          [
            deterministicUuid(`onboarding:checklist:${intakeId}:${key}`),
            caseId,tenantId,key,name,category,
            ["company_profile_complete","plan_assigned","site_created",
              "template_assigned","domain_or_subdomain_ready"].includes(key)
              ? "completed" : "pending",
            required,source,clientVisible,checklist.findIndex((item) => item[0] === key) + 1,
          ],
        );
      }
      await client.query(
        `INSERT INTO public.onboarding_state_history(
           onboarding_case_id,tenant_id,from_status,to_status,actor_user_id,
           correlation_id,reason_code
         ) SELECT $1,$2,NULL,'received',$3,$4,'conversion'
         WHERE NOT EXISTS(
           SELECT 1 FROM public.onboarding_state_history WHERE onboarding_case_id=$1
         )`,
        [caseId,tenantId,session.userId,correlationId],
      );
      await client.query(
        `UPDATE public.onboarding_intake_requests SET
           conversion_status='identity_pending',
           conversion_progress=jsonb_build_object(
             'resources_prepared',true,'identity','pending'
           ),
           converted_tenant_id=$2,converted_site_id=$3,converted_case_id=$4,
           version=version+1 WHERE id=$1`,
        [intakeId,tenantId,siteId,caseId],
      );
      await audit(client, {
        tenantId,
        action: "onboarding_case_created",
        resourceType: "onboarding_case",
        resourceId: caseId,
        correlationId,
        metadata: { intake_id: intakeId },
      });
      return {
        intakeId,tenantId,siteId,caseId,
        contactEmail: intake.email,contactName: intake.contactName,
      };
    });
  } catch (error) {
    throw mapError(error);
  }
}

export async function convertIntake(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
  testOptions?: Readonly<{ failBeforeInvitationDispatch?: boolean }>,
): Promise<PreparedConversion & { acceptanceToken?: string }> {
  const prepared = await prepareConversionResources(session, form, correlationId);
  const config = loadAuthConfig();
  if (!["local","test"].includes(config.environment)) {
    throw new OnboardingOperationError("provider");
  }
  const invitationKey = deterministicUuid(`onboarding:invitation:${prepared.intakeId}`);
  let invitationId: string | null = null;
  let acceptanceToken: string | undefined;
  try {
    if (
      testOptions?.failBeforeInvitationDispatch &&
      config.environment === "test"
    ) {
      throw new Error("synthetic onboarding identity failure");
    }
    const reservation = await reserveInvitation(actor(session), {
      tenantId: prepared.tenantId,
      idempotencyKey: invitationKey,
      fingerprint: requestFingerprint([
        prepared.tenantId,prepared.contactEmail,prepared.contactName,config.provider,
      ]),
      email: prepared.contactEmail,
      displayName: prepared.contactName,
      provider: config.provider,
      expiresAt: new Date(Date.now() + config.invitationTtlSeconds * 1000),
    });
    invitationId = reservation.invitationId;
    let shouldDispatch = reservation.shouldDispatch;
    if (!shouldDispatch) {
      const invitations = await listInvitations(actor(session), {
        tenantId: prepared.tenantId,
        status: null,
        limit: 50,
        offset: 0,
      });
      const existing = invitations.find(
        (invitation) => invitation.invitationId === reservation.invitationId,
      );
      if (
        existing &&
        ["failed", "expired"].includes(existing.invitationStatus)
      ) {
        await prepareInvitationResend(
          actor(session),
          reservation.invitationId,
          new Date(Date.now() + config.invitationTtlSeconds * 1000),
        );
        shouldDispatch = true;
      }
    }
    if (shouldDispatch) {
      const provider = createIdentityProvider(config);
      const expiresAt = new Date(Date.now() + config.invitationTtlSeconds * 1000);
      const dispatch = await provider.sendInvitation(
        prepared.contactEmail,
        prepared.contactName,
        `${config.publicUrl}/invitacion/aceptar`,
      );
      acceptanceToken = dispatch.acceptanceToken;
      await completeInvitation(
        actor(session),invitationId,dispatch.providerReference,expiresAt,correlationId,
      );
    }
  } catch (error) {
    if (invitationId) {
      await failInvitation(
        actor(session),invitationId,
        "La invitación sintética quedó pendiente de reintento.",correlationId,
      ).catch(() => undefined);
    }
    await withAdminOperation(session, correlationId, async (client) => {
      await client.query(
        `UPDATE public.onboarding_intake_requests SET
           conversion_status='recoverable_failure',
           conversion_progress=jsonb_build_object(
             'resources_prepared',true,'identity','retry_required'
           ),version=version+1 WHERE id=$1`,
        [prepared.intakeId],
      );
    });
    const mapped = new OnboardingOperationError("provider");
    Object.defineProperty(mapped, "cause", {
      value: error,
      enumerable: false,
    });
    throw mapped;
  }
  await withAdminOperation(session, correlationId, async (client) => {
    await client.query(
      `UPDATE public.onboarding_cases SET invitation_id=$2,
         status=CASE WHEN status='received' THEN 'pending_review' ELSE status END,
         version=version+1 WHERE id=$1`,
      [prepared.caseId,invitationId],
    );
    await client.query(
      `UPDATE public.onboarding_intake_requests SET status='converted',
         converted_at=COALESCE(converted_at,transaction_timestamp()),
         conversion_status='completed',
         conversion_progress=jsonb_build_object(
           'resources_prepared',true,'identity','invitation_ready'
         ),version=version+1 WHERE id=$1`,
      [prepared.intakeId],
    );
    await client.query(
      `INSERT INTO public.onboarding_state_history(
         onboarding_case_id,tenant_id,from_status,to_status,actor_user_id,
         correlation_id,reason_code
       ) SELECT $1,$2,'received','pending_review',$3,$4,'identity_ready'
       WHERE NOT EXISTS(
         SELECT 1 FROM public.onboarding_state_history
         WHERE onboarding_case_id=$1 AND to_status='pending_review'
       )`,
      [prepared.caseId,prepared.tenantId,session.userId,correlationId],
    );
    await audit(client, {
      tenantId: prepared.tenantId,
      action: "onboarding_intake_converted",
      resourceType: "onboarding_intake",
      resourceId: prepared.intakeId,
      correlationId,
      metadata: { resumable: true },
    });
  });
  return { ...prepared, acceptanceToken };
}

const caseSelect = `
  case_record.id,case_record.tenant_id AS "tenantId",
  tenant.display_name AS "tenantName",case_record.site_id AS "siteId",
  site.display_name AS "siteName",site.slug AS "siteSlug",
  case_record.status,
  case_record.previous_operational_status AS "previousStatus",
  case_record.priority,
  assigned.display_name AS "assignedAdminName",
  case_record.linked_conversation_id AS "linkedConversationId",
  case_record.target_template_version_id AS "targetTemplateVersionId",
  answers.answers,answers.revision AS "answersRevision",
  answers.completion_state AS "answersCompletionState",
  draft.revision AS "draftRevision",
  approval.id AS "approvalId",approval.status AS "approvalStatus",
  approval.content_checksum AS "approvalChecksum",
  case_record.publication_id AS "publicationId",
  case_record.version,case_record.updated_at AS "updatedAt"`;

export async function adminCases(
  session: Readonly<AuthSession>,
  status?: string | null,
): Promise<OnboardingCaseRecord[]> {
  const filter = status && ONBOARDING_CASE_STATUSES.includes(
    status as OnboardingCaseStatus,
  ) ? status : null;
  try {
    return await withAdminOperation(session, "onboarding-cases", async (client) => {
      const result = await client.query<OnboardingCaseRecord>(
        `SELECT ${caseSelect}
         FROM public.onboarding_cases case_record
         JOIN public.tenants tenant ON tenant.id=case_record.tenant_id
         JOIN public.sites site ON site.id=case_record.site_id
         LEFT JOIN public.users assigned ON assigned.id=case_record.assigned_admin_user_id
         LEFT JOIN public.onboarding_answers answers
           ON answers.onboarding_case_id=case_record.id
         LEFT JOIN public.site_content_drafts draft ON draft.site_id=case_record.site_id
         LEFT JOIN public.onboarding_client_approvals approval
           ON approval.onboarding_case_id=case_record.id
          AND approval.status IN ('pending','approved')
         WHERE ($1::text IS NULL OR case_record.status=$1)
         ORDER BY
           CASE case_record.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
           case_record.updated_at DESC`,
        [filter],
      );
      return result.rows;
    });
  } catch (error) {
    throw mapError(error);
  }
}

export async function adminCase(
  session: Readonly<AuthSession>,
  caseId: string,
): Promise<OnboardingCaseRecord | null> {
  if (!UUID.test(caseId)) return null;
  try {
    return await withAdminOperation(session, "onboarding-case", async (client) => {
      const result = await client.query<OnboardingCaseRecord>(
        `SELECT ${caseSelect}
         FROM public.onboarding_cases case_record
         JOIN public.tenants tenant ON tenant.id=case_record.tenant_id
         JOIN public.sites site ON site.id=case_record.site_id
         LEFT JOIN public.users assigned ON assigned.id=case_record.assigned_admin_user_id
         LEFT JOIN public.onboarding_answers answers
           ON answers.onboarding_case_id=case_record.id
         LEFT JOIN public.site_content_drafts draft ON draft.site_id=case_record.site_id
         LEFT JOIN public.onboarding_client_approvals approval
           ON approval.onboarding_case_id=case_record.id
          AND approval.status IN ('pending','approved')
         WHERE case_record.id=$1`,
        [caseId],
      );
      return result.rows[0] ?? null;
    });
  } catch (error) {
    throw mapError(error);
  }
}

export async function adminCaseOperationalDetails(
  session: Readonly<AuthSession>,
  caseId: string,
): Promise<{
  checklist: Array<{
    itemKey: string;
    displayName: string;
    category: string;
    status: string;
    required: boolean;
    source: string;
    blockedReason: string | null;
    displayOrder: number;
    version: number;
  }>;
  notes: Array<{
    id: string;
    authorName: string;
    category: string;
    note: string;
    createdAt: Date;
  }>;
  history: Array<{
    id: number;
    fromStatus: string | null;
    toStatus: string;
    reasonCode: string | null;
    actorName: string | null;
    createdAt: Date;
  }>;
  audit: Array<{
    id: number;
    action: string;
    outcome: string;
    actorName: string | null;
    occurredAt: Date;
  }>;
}> {
  if (!UUID.test(caseId)) {
    return { checklist: [], notes: [], history: [], audit: [] };
  }
  try {
    return await withAdminOperation(session, "onboarding-case-detail", async (client) => {
      const [checklistRows, noteRows, historyRows, auditRows] = await Promise.all([
        client.query<{
          itemKey: string; displayName: string; category: string; status: string;
          required: boolean; source: string; blockedReason: string | null;
          displayOrder: number; version: number;
        }>(
          `SELECT item_key AS "itemKey",display_name AS "displayName",
             category,status,required,source,blocked_reason AS "blockedReason",
             display_order AS "displayOrder",version
           FROM public.onboarding_checklist_items
           WHERE onboarding_case_id=$1 ORDER BY display_order`,
          [caseId],
        ),
        client.query<{
          id: string; authorName: string; category: string; note: string; createdAt: Date;
        }>(
          `SELECT note.id,account.display_name AS "authorName",note.category,
             note.note,note.created_at AS "createdAt"
           FROM public.onboarding_internal_notes note
           JOIN public.users account ON account.id=note.author_user_id
           WHERE note.onboarding_case_id=$1 ORDER BY note.created_at DESC`,
          [caseId],
        ),
        client.query<{
          id: number; fromStatus: string | null; toStatus: string;
          reasonCode: string | null; actorName: string | null; createdAt: Date;
        }>(
          `SELECT history.id,history.from_status AS "fromStatus",
             history.to_status AS "toStatus",history.reason_code AS "reasonCode",
             account.display_name AS "actorName",history.created_at AS "createdAt"
           FROM public.onboarding_state_history history
           LEFT JOIN public.users account ON account.id=history.actor_user_id
           WHERE history.onboarding_case_id=$1 ORDER BY history.id DESC`,
          [caseId],
        ),
        client.query<{
          id: number; action: string; outcome: string;
          actorName: string | null; occurredAt: Date;
        }>(
          `SELECT event.id,event.action,event.outcome,
             account.display_name AS "actorName",
             event.occurred_at AS "occurredAt"
           FROM public.platform_audit_events event
           LEFT JOIN public.users account ON account.id=event.actor_user_id
           WHERE event.resource_id=$1
              OR event.metadata->>'onboarding_case_id'=$1
           ORDER BY event.id DESC LIMIT 100`,
          [caseId],
        ),
      ]);
      return {
        checklist: checklistRows.rows,
        notes: noteRows.rows,
        history: historyRows.rows,
        audit: auditRows.rows,
      };
    });
  } catch (error) {
    throw mapError(error);
  }
}

const transitions: Readonly<Record<OnboardingCaseStatus, readonly OnboardingCaseStatus[]>> = {
  received: ["pending_review","paused","canceled"],
  pending_review: ["waiting_information","preparing","paused","canceled"],
  waiting_information: ["preparing","paused","canceled"],
  preparing: ["internal_review","paused","canceled"],
  internal_review: ["waiting_information","waiting_client_approval","preparing","paused","canceled"],
  waiting_client_approval: ["preparing","ready_to_publish","paused","canceled"],
  ready_to_publish: ["preparing","paused","canceled"],
  published: [],
  paused: [
    "received","pending_review","waiting_information","preparing",
    "internal_review","waiting_client_approval","ready_to_publish","canceled",
  ],
  canceled: [],
};

export async function transitionCase(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const caseId = uuid(form.get("case_id"));
  const expectedVersion = integer(form.get("version"));
  const target = String(form.get("target_status") || "") as OnboardingCaseStatus;
  const reason = clean(form.get("reason"), 2, 500, true);
  if (!ONBOARDING_CASE_STATUSES.includes(target)) {
    throw new OnboardingOperationError("invalid");
  }
  try {
    return await withAdminOperation(session, correlationId, async (client) => {
      const result = await client.query<{
        tenantId: string; status: OnboardingCaseStatus; version: number;
        previous: OnboardingCaseStatus | null;
      }>(
        `SELECT tenant_id AS "tenantId",status,version,
           previous_operational_status AS previous
         FROM public.onboarding_cases WHERE id=$1 FOR UPDATE`,
        [caseId],
      );
      const current = result.rows[0];
      if (!current) throw new OnboardingOperationError("not_found");
      if (current.version !== expectedVersion) {
        throw new OnboardingOperationError("conflict");
      }
      const allowed = transitions[current.status];
      if (!allowed.includes(target) || target === "published" ||
          target === "ready_to_publish") {
        throw new OnboardingOperationError("conflict");
      }
      if (["paused","canceled"].includes(target) && !reason) {
        throw new OnboardingOperationError("invalid");
      }
      if (current.status === "paused" && target !== current.previous &&
          target !== "canceled") {
        throw new OnboardingOperationError("conflict");
      }
      await client.query(
        `UPDATE public.onboarding_cases SET status=$2,
           previous_operational_status=CASE WHEN $2='paused' THEN status
             WHEN status='paused' THEN NULL ELSE previous_operational_status END,
           paused_at=CASE WHEN $2='paused' THEN transaction_timestamp()
             WHEN status='paused' THEN NULL ELSE paused_at END,
           canceled_at=CASE WHEN $2='canceled' THEN transaction_timestamp()
             ELSE canceled_at END,
           version=version+1 WHERE id=$1`,
        [caseId,target],
      );
      await client.query(
        `INSERT INTO public.onboarding_state_history(
           onboarding_case_id,tenant_id,from_status,to_status,reason_code,
           actor_user_id,correlation_id
         ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          caseId,current.tenantId,current.status,target,
          reason ? "operator_reason_recorded" : null,session.userId,correlationId,
        ],
      );
      await audit(client, {
        tenantId: current.tenantId,
        action: target === "paused"
          ? "onboarding_case_paused"
          : current.status === "paused"
            ? "onboarding_case_resumed"
            : target === "canceled"
              ? "onboarding_case_canceled"
              : "onboarding_case_transitioned",
        resourceType: "onboarding_case",
        resourceId: caseId,
        correlationId,
        previous: { status: current.status },
        next: { status: target },
      });
      return caseId;
    });
  } catch (error) {
    throw mapError(error);
  }
}

export async function updateCaseOperations(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const caseId = uuid(form.get("case_id"));
  const expectedVersion = integer(form.get("version"));
  const priority = String(form.get("priority") || "") as OnboardingPriority;
  const assigned = optionalUuid(form.get("assigned_admin_user_id"));
  const note = clean(form.get("internal_note"), 2, 2000, true);
  if (!["normal","high","urgent"].includes(priority)) {
    throw new OnboardingOperationError("invalid");
  }
  try {
    return await withAdminOperation(session, correlationId, async (client) => {
      const current = await client.query<{
        tenantId: string; priority: string; assigned: string | null; version: number;
      }>(
        `SELECT tenant_id AS "tenantId",priority,
           assigned_admin_user_id AS assigned,version
         FROM public.onboarding_cases WHERE id=$1 FOR UPDATE`,
        [caseId],
      );
      if (!current.rows[0]) throw new OnboardingOperationError("not_found");
      if (current.rows[0].version !== expectedVersion) {
        throw new OnboardingOperationError("conflict");
      }
      if (assigned) {
        const valid = await client.query(
          `SELECT 1 FROM app_private.onboarding_list_active_admins()
           WHERE id=$1`,
          [assigned],
        );
        if (!valid.rowCount) throw new OnboardingOperationError("invalid");
      }
      await client.query(
        `UPDATE public.onboarding_cases SET priority=$2,
           assigned_admin_user_id=$3,version=version+1 WHERE id=$1`,
        [caseId,priority,assigned],
      );
      if (note) {
        await client.query(
          `INSERT INTO public.onboarding_internal_notes(
             onboarding_case_id,tenant_id,author_user_id,category,note,
             idempotency_key
           ) VALUES($1,$2,$3,'general',$4,$5)
           ON CONFLICT(onboarding_case_id,author_user_id,idempotency_key)
             DO NOTHING`,
          [
            caseId,current.rows[0].tenantId,session.userId,note,
            uuid(form.get("note_idempotency_key")),
          ],
        );
      }
      if (current.rows[0].priority !== priority) {
        await audit(client, {
          tenantId: current.rows[0].tenantId,
          action: "onboarding_priority_changed",
          resourceType: "onboarding_case",
          resourceId: caseId,
          correlationId,
          previous: { priority: current.rows[0].priority },
          next: { priority },
        });
      }
      if (current.rows[0].assigned !== assigned) {
        await audit(client, {
          tenantId: current.rows[0].tenantId,
          action: "onboarding_assignee_changed",
          resourceType: "onboarding_case",
          resourceId: caseId,
          correlationId,
          previous: { assigned: Boolean(current.rows[0].assigned) },
          next: { assigned: Boolean(assigned) },
        });
      }
      return caseId;
    });
  } catch (error) {
    throw mapError(error);
  }
}

function progressFor(status: OnboardingCaseStatus, checklistRows: Array<{
  itemKey: string; displayName: string; status: string; displayOrder: number;
}>): ClientOnboardingWorkspace["progress"] {
  const groups = [
    ["business","Datos de la empresa",["company_profile_complete","business_identity_complete"]],
    ["content","Contenido",["hero_complete","about_complete","menu_complete","hours_complete","contact_complete","seo_complete"]],
    ["media","Imágenes",["media_ready"]],
    ["review","Revisión nexi",["internal_review_complete","draft_generated"]],
    ["approval","Tu aprobación",["client_approval_valid"]],
    ["publication","Publicación",["publication_verified"]],
  ] as const;
  const currentIndex = status === "published" ? 5
    : status === "ready_to_publish" ? 5
      : status === "waiting_client_approval" ? 4
        : status === "internal_review" ? 3
          : status === "preparing" ? 1
            : 0;
  return groups.map(([key,label,items], index) => ({
    key,label,
    complete: items.every((item) =>
      checklistRows.some((row) =>
        row.itemKey === item &&
        ["completed","not_applicable"].includes(row.status),
      ),
    ),
    current: index === currentIndex,
  }));
}

export async function clientOnboarding(
  session: Readonly<AuthSession>,
  caseId?: string | null,
): Promise<ClientOnboardingWorkspace | null> {
  if (caseId && !UUID.test(caseId)) return null;
  try {
    return await withClientOperation(session, "client-onboarding", async (client) => {
      const result = await client.query<Omit<
        ClientOnboardingWorkspace,
        "visibleChecklist" | "progress"
      >>(
        `SELECT case_record.id,case_record.tenant_id AS "tenantId",
           tenant.display_name AS "tenantName",case_record.site_id AS "siteId",
           site.display_name AS "siteName",site.slug AS "siteSlug",
           case_record.status,
           case_record.linked_conversation_id AS "linkedConversationId",
           case_record.target_template_version_id AS "targetTemplateVersionId",
           answers.answers,answers.revision AS "answersRevision",
           answers.completion_state AS "answersCompletionState",
           draft.revision AS "draftRevision",
           approval.id AS "approvalId",approval.status AS "approvalStatus",
           case_record.publication_id AS "publicationId",
           case_record.version,case_record.updated_at AS "updatedAt"
         FROM public.onboarding_cases case_record
         JOIN public.tenants tenant ON tenant.id=case_record.tenant_id
         JOIN public.sites site ON site.id=case_record.site_id
         LEFT JOIN public.onboarding_answers answers
           ON answers.onboarding_case_id=case_record.id
         LEFT JOIN public.site_content_drafts draft ON draft.site_id=case_record.site_id
         LEFT JOIN public.onboarding_client_approvals approval
           ON approval.onboarding_case_id=case_record.id
          AND approval.status IN ('pending','approved')
         WHERE case_record.tenant_id=app_context.current_tenant_id()
           AND ($1::uuid IS NULL OR case_record.id=$1)
           AND case_record.status<>'canceled'
         ORDER BY case_record.updated_at DESC LIMIT 1`,
        [caseId ?? null],
      );
      const current = result.rows[0];
      if (!current) return null;
      const visible = await client.query<{
        itemKey: string; displayName: string; status: string; displayOrder: number;
      }>(
        `SELECT item_key AS "itemKey",display_name AS "displayName",
           status,display_order AS "displayOrder"
         FROM public.onboarding_checklist_items
         WHERE onboarding_case_id=$1 AND client_visible
         ORDER BY display_order`,
        [current.id],
      );
      return {
        ...current,
        visibleChecklist: visible.rows,
        progress: progressFor(current.status, visible.rows),
      };
    });
  } catch (error) {
    throw mapError(error);
  }
}

function collectAssetIds(answers: RestaurantOnboardingAnswersV1): string[] {
  return [
    answers.media.hero?.assetId,
    ...answers.menu.items.map((item) => item.media?.assetId),
  ].filter((value): value is string => Boolean(value));
}

export async function saveClientAnswers(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const caseId = uuid(form.get("case_id"));
  const expectedRevision = Number(form.get("revision") || 0);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new OnboardingOperationError("invalid");
  }
  const completion = form.get("submit_for_review") === "true" ? "submitted" : "draft";
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("answers") || ""));
  } catch {
    throw new OnboardingOperationError("invalid");
  }
  const answers = validateRestaurantOnboardingAnswers(
    raw,
    completion === "submitted" ? "submitted" : "draft",
  );
  const key = uuid(form.get("idempotency_key"));
  try {
    return await withClientOperation(session, correlationId, async (client) => {
      const current = await client.query<{
        tenantId: string; siteId: string; status: OnboardingCaseStatus;
      }>(
        `SELECT tenant_id AS "tenantId",site_id AS "siteId",status
         FROM public.onboarding_cases
         WHERE id=$1 AND tenant_id=app_context.current_tenant_id()
         FOR UPDATE`,
        [caseId],
      );
      const caseRow = current.rows[0];
      if (!caseRow) throw new OnboardingOperationError("not_found");
      if (!["preparing","waiting_information","pending_review"].includes(caseRow.status)) {
        throw new OnboardingOperationError("conflict");
      }
      const assetIds = [...new Set(collectAssetIds(answers))];
      if (assetIds.length) {
        const assets = await client.query<{ id: string }>(
          `SELECT id FROM public.media_assets
           WHERE tenant_id=app_context.current_tenant_id() AND site_id=$1
             AND status='ready' AND id=ANY($2::uuid[])`,
          [caseRow.siteId,assetIds],
        );
        if (assets.rowCount !== assetIds.length) {
          throw new OnboardingOperationError("invalid","media");
        }
      }
      const stored = await client.query<{
        id: string; revision: number; key: string;
      }>(
        `SELECT id,revision,last_idempotency_key::text AS key
         FROM public.onboarding_answers WHERE onboarding_case_id=$1 FOR UPDATE`,
        [caseId],
      );
      if (stored.rows[0]?.key === key) return caseId;
      if ((stored.rows[0]?.revision ?? 0) !== expectedRevision) {
        throw new OnboardingOperationError("conflict");
      }
      if (stored.rows[0]) {
        await client.query(
          `UPDATE public.onboarding_answers SET answers=$2::jsonb,
             revision=revision+1,completion_state=$3,
             updated_by_user_id=app_context.current_user_id(),
             last_idempotency_key=$4 WHERE onboarding_case_id=$1`,
          [caseId,JSON.stringify(answers),completion,key],
        );
      } else {
        await client.query(
          `INSERT INTO public.onboarding_answers(
             onboarding_case_id,tenant_id,schema_key,schema_version,answers,
             completion_state,updated_by_user_id,last_idempotency_key
           ) VALUES(
             $1,app_context.current_tenant_id(),'restaurant_onboarding.v1',1,
             $2::jsonb,$3,app_context.current_user_id(),$4
           )`,
          [caseId,JSON.stringify(answers),completion,key],
        );
      }
      const invalidated = await client.query(
        `UPDATE public.onboarding_client_approvals SET
           status='invalidated',invalidated_at=transaction_timestamp(),
           invalidation_reason='answers_changed',version=version+1
         WHERE onboarding_case_id=$1 AND status IN ('pending','approved')`,
        [caseId],
      );
      if ((invalidated.rowCount ?? 0) > 0) {
        await client.query(
          `UPDATE public.onboarding_checklist_items SET status='pending',
             completed_at=NULL,completed_by_user_id=NULL,version=version+1
           WHERE onboarding_case_id=$1
             AND item_key IN ('client_approval_valid','publication_ready')`,
          [caseId],
        );
      }
      await client.query(
        `UPDATE public.onboarding_cases SET
           status=$2,current_step=CASE WHEN $2='internal_review'
             THEN 'nexi_review' ELSE 'content' END,
           submitted_for_review_at=CASE WHEN $2='internal_review'
             THEN transaction_timestamp() ELSE submitted_for_review_at END,
           approved_at=NULL,ready_to_publish_at=NULL,version=version+1
         WHERE id=$1`,
        [caseId,completion === "submitted" ? "internal_review" : "preparing"],
      );
      const completed = completion === "submitted";
      await client.query(
        `UPDATE public.onboarding_checklist_items SET
           status=CASE WHEN item_key=ANY($2::text[]) THEN 'completed' ELSE status END,
           completed_at=CASE WHEN item_key=ANY($2::text[])
             THEN transaction_timestamp() ELSE completed_at END,
           completed_by_user_id=CASE WHEN item_key=ANY($2::text[])
             THEN app_context.current_user_id() ELSE completed_by_user_id END,
           version=version+1
         WHERE onboarding_case_id=$1 AND (
           item_key=ANY($2::text[]) OR false
         )`,
        [
          caseId,
          completed ? [
            "business_identity_complete","hero_complete","about_complete",
            "menu_complete","hours_complete","contact_complete","social_complete",
            "seo_complete",
          ] : [],
        ],
      );
      await audit(client, {
        tenantId: caseRow.tenantId,
        action: "onboarding_answers_saved",
        resourceType: "onboarding_answers",
        resourceId: caseId,
        correlationId,
        metadata: {
          submitted: completed,
          approval_invalidated: (invalidated.rowCount ?? 0) > 0,
        },
      });
      return caseId;
    });
  } catch (error) {
    throw mapError(error);
  }
}

function mediaUsagesFromContent(
  content: ReturnType<typeof transformOnboardingToRestaurantV2>,
): Array<{ path: string; assetId: string; altText: string; decorative: boolean }> {
  const references: Array<{
    path: string; assetId: string; altText: string; decorative: boolean;
  }> = [];
  if (content.hero.media) {
    references.push({
      path: "hero.media",
      assetId: content.hero.media.assetId,
      altText: content.hero.media.altText,
      decorative: content.hero.media.decorative,
    });
  }
  content.menu.items.forEach((item, index) => {
    if (item.media) {
      references.push({
        path: `menu.items.${index}.media`,
        assetId: item.media.assetId,
        altText: item.media.altText,
        decorative: item.media.decorative,
      });
    }
  });
  return references;
}

export async function generateOnboardingDraft(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
  testOptions?: Readonly<{ failAfterDraftWrite?: boolean }>,
): Promise<OnboardingDraftResult> {
  const caseId = uuid(form.get("case_id"));
  const generationKey = uuid(form.get("idempotency_key"));
  const expectedDraftRevision = Number(form.get("draft_revision") || 0);
  const confirmReplace = form.get("confirm_replace") === "true";
  if (!Number.isSafeInteger(expectedDraftRevision) || expectedDraftRevision < 0) {
    throw new OnboardingOperationError("invalid");
  }
  try {
    return await withAdminOperation(session, correlationId, async (client) => {
      const result = await client.query<{
        tenantId: string;
        siteId: string;
        status: OnboardingCaseStatus;
        answers: unknown;
        answersRevision: number;
        completionState: string;
        templateVersionId: string;
        rendererKey: string;
        generatedDraftRevision: number | null;
        lastGenerationKey: string | null;
      }>(
        `SELECT case_record.tenant_id AS "tenantId",
           case_record.site_id AS "siteId",case_record.status,
           answers.answers,answers.revision AS "answersRevision",
           answers.completion_state AS "completionState",
           assignment.template_version_id AS "templateVersionId",
           version.renderer_key AS "rendererKey",
           case_record.generated_draft_revision AS "generatedDraftRevision",
           case_record.last_generation_idempotency_key::text AS "lastGenerationKey"
         FROM public.onboarding_cases case_record
         JOIN public.onboarding_answers answers
           ON answers.onboarding_case_id=case_record.id
         JOIN public.site_template_assignments assignment
           ON assignment.site_id=case_record.site_id AND assignment.status='active'
         JOIN public.template_versions version
           ON version.id=assignment.template_version_id
         WHERE case_record.id=$1 FOR UPDATE OF case_record,answers,assignment`,
        [caseId],
      );
      const current = result.rows[0];
      if (!current) throw new OnboardingOperationError("not_found");
      if (!["internal_review","preparing"].includes(current.status) ||
          current.completionState !== "submitted") {
        throw new OnboardingOperationError("conflict");
      }
      const answers = validateRestaurantOnboardingAnswers(
        current.answers,
        "submitted",
      );
      const content = transformOnboardingToRestaurantV2(answers, "draft");
      const draft = await client.query<{
        id: string; revision: number; content: unknown; schemaKey: string;
      }>(
        `SELECT id,revision,content,schema_key AS "schemaKey"
         FROM public.site_content_drafts WHERE site_id=$1 FOR UPDATE`,
        [current.siteId],
      );
      const existing = draft.rows[0];
      if (current.lastGenerationKey === generationKey && existing) {
        return {
          caseId,
          siteId: current.siteId,
          draftId: existing.id,
          draftRevision: existing.revision,
          content: validateRestaurantV2Content(existing.content, "draft"),
          checksum: onboardingContentChecksum({
            siteId: current.siteId,
            draftRevision: existing.revision,
            templateVersionId: current.templateVersionId,
            schemaKey: "restaurant.v2",
            schemaVersion: 2,
            content: validateRestaurantV2Content(existing.content, "draft"),
          }),
        };
      }
      if ((existing?.revision ?? 0) !== expectedDraftRevision) {
        throw new OnboardingOperationError("conflict");
      }
      if (
        existing &&
        current.generatedDraftRevision !== null &&
        current.generatedDraftRevision !== existing.revision &&
        !confirmReplace
      ) {
        throw new OnboardingOperationError("conflict","draft_manual_changes");
      }
      if (!rendererIsCompatible(
        current.rendererKey,
        "restaurant",
        "restaurant.v2",
        2,
      )) {
        throw new OnboardingOperationError("unsupported");
      }
      const references = mediaUsagesFromContent(content);
      if (references.length) {
        const ready = await client.query<{ id: string }>(
          `SELECT id FROM public.media_assets
           WHERE tenant_id=$1 AND site_id=$2 AND status='ready'
             AND id=ANY($3::uuid[])`,
          [
            current.tenantId,
            current.siteId,
            [...new Set(references.map((entry) => entry.assetId))],
          ],
        );
        if (ready.rowCount !== new Set(references.map((entry) => entry.assetId)).size) {
          throw new OnboardingOperationError("incomplete","media");
        }
      }
      const nextRevision = existing ? existing.revision + 1 : 1;
      const draftId = existing?.id ?? deterministicUuid(`onboarding:draft:${caseId}`);
      if (existing) {
        await client.query(
          `UPDATE public.site_content_drafts SET
             schema_key='restaurant.v2',schema_version=2,content=$2::jsonb,
             revision=$3,updated_by_user_id=$4,last_idempotency_key=$5
           WHERE id=$1`,
          [draftId,JSON.stringify(content),nextRevision,session.userId,generationKey],
        );
      } else {
        await client.query(
          `INSERT INTO public.site_content_drafts(
             id,tenant_id,site_id,schema_key,schema_version,content,revision,
             created_by_user_id,updated_by_user_id,last_idempotency_key
           ) VALUES($1,$2,$3,'restaurant.v2',2,$4::jsonb,1,$5,$5,$6)`,
          [
            draftId,current.tenantId,current.siteId,
            JSON.stringify(content),session.userId,generationKey,
          ],
        );
      }
      await client.query(
        `DELETE FROM public.content_media_references
         WHERE draft_id=$1 AND owner_kind='draft'`,
        [draftId],
      );
      for (const reference of references) {
        await client.query(
          `INSERT INTO public.content_media_references(
             tenant_id,site_id,owner_kind,draft_id,field_path,asset_id,
             alt_text,decorative
           ) VALUES($1,$2,'draft',$3,$4,$5,$6,$7)`,
          [
            current.tenantId,current.siteId,draftId,reference.path,
            reference.assetId,reference.altText,reference.decorative,
          ],
        );
      }
      if (
        testOptions?.failAfterDraftWrite &&
        process.env.APP_ENV === "test"
      ) {
        throw new Error("synthetic onboarding draft failure");
      }
      const checksum = onboardingContentChecksum({
        siteId: current.siteId,
        draftRevision: nextRevision,
        templateVersionId: current.templateVersionId,
        schemaKey: "restaurant.v2",
        schemaVersion: 2,
        content,
      });
      await client.query(
        `UPDATE public.onboarding_cases SET
           status='internal_review',current_step='nexi_review',
           generated_from_answers_revision=$2,generated_draft_revision=$3,
           generated_content_checksum=$4,last_generation_idempotency_key=$5,
           version=version+1 WHERE id=$1`,
        [caseId,current.answersRevision,nextRevision,checksum,generationKey],
      );
      await client.query(
        `UPDATE public.onboarding_checklist_items SET status='completed',
           completed_at=transaction_timestamp(),completed_by_user_id=$2,
           version=version+1
         WHERE onboarding_case_id=$1
           AND item_key IN ('media_ready','draft_generated')`,
        [caseId,session.userId],
      );
      await audit(client, {
        tenantId: current.tenantId,
        action: "onboarding_draft_generated",
        resourceType: "content_draft",
        resourceId: draftId,
        correlationId,
        metadata: {
          answers_revision: current.answersRevision,
          draft_revision: nextRevision,
          media_count: references.length,
        },
      });
      return {
        caseId,
        siteId: current.siteId,
        draftId,
        draftRevision: nextRevision,
        content,
        checksum,
      };
    });
  } catch (error) {
    throw mapError(error);
  }
}

async function insertLinkedMessage(
  client: PoolClient,
  input: Readonly<{
    tenantId: string;
    conversationId: string;
    senderUserId: string;
    senderScope: "client_admin" | "nexi_admin";
    body: string;
    key: string;
    status: "awaiting_client" | "awaiting_nexi";
    recipientUserId?: string | null;
    path: string;
  }>,
): Promise<void> {
  const message = await client.query<{ id: string }>(
    `INSERT INTO public.support_messages(
       tenant_id,conversation_id,sender_user_id,sender_scope,body,idempotency_key
     ) VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(conversation_id,sender_user_id,idempotency_key) DO NOTHING
     RETURNING id`,
    [
      input.tenantId,input.conversationId,input.senderUserId,input.senderScope,
      input.body,input.key,
    ],
  );
  await client.query(
    `UPDATE public.support_conversations SET status=$2,
       last_message_at=CASE WHEN $3::boolean THEN transaction_timestamp()
         ELSE last_message_at END,version=version+1 WHERE id=$1`,
    [input.conversationId,input.status,Boolean(message.rows[0])],
  );
  if (message.rows[0] && input.recipientUserId) {
    await client.query(
      `SELECT app_private.operation_enqueue_notification(
         $1,$2,'onboarding_update',$3::jsonb,$4
       )`,
      [
        input.tenantId,input.recipientUserId,
        JSON.stringify({ path: input.path }),
        `onboarding:${message.rows[0].id}:${input.recipientUserId}`,
      ],
    );
  }
}

export async function requestOnboardingInformation(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const caseId = uuid(form.get("case_id"));
  const expectedVersion = integer(form.get("version"));
  const message = clean(form.get("message"), 2, 2000)!;
  const key = uuid(form.get("idempotency_key"));
  try {
    return await withAdminOperation(session, correlationId, async (client) => {
      const current = await client.query<{
        tenantId: string; conversationId: string; clientUserId: string | null;
        status: OnboardingCaseStatus; version: number;
      }>(
        `SELECT tenant_id AS "tenantId",
           linked_conversation_id AS "conversationId",
           primary_client_user_id AS "clientUserId",status,version
         FROM public.onboarding_cases WHERE id=$1 FOR UPDATE`,
        [caseId],
      );
      const row = current.rows[0];
      if (!row) throw new OnboardingOperationError("not_found");
      if (row.version !== expectedVersion || !row.conversationId ||
          ["published","canceled"].includes(row.status)) {
        throw new OnboardingOperationError("conflict");
      }
      await insertLinkedMessage(client, {
        tenantId: row.tenantId,
        conversationId: row.conversationId,
        senderUserId: session.userId,
        senderScope: "nexi_admin",
        body: message,
        key,
        status: "awaiting_client",
        recipientUserId: row.clientUserId,
        path: `/cuenta/incorporacion/${caseId}`,
      });
      await client.query(
        `UPDATE public.onboarding_cases SET status='waiting_information',
           current_step='content',version=version+1 WHERE id=$1`,
        [caseId],
      );
      await audit(client, {
        tenantId: row.tenantId,
        action: "onboarding_information_requested",
        resourceType: "onboarding_case",
        resourceId: caseId,
        correlationId,
      });
      return caseId;
    });
  } catch (error) {
    throw mapError(error);
  }
}

export async function updateChecklistItem(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const caseId = uuid(form.get("case_id"));
  const itemKey = clean(form.get("item_key"), 3, 64)!;
  const expectedVersion = integer(form.get("item_version"));
  const status = String(form.get("status") || "");
  const blockedReason = clean(form.get("blocked_reason"), 2, 500, true);
  if (!["pending","in_progress","completed","blocked","not_applicable"].includes(status) ||
      (status === "blocked" && !blockedReason)) {
    throw new OnboardingOperationError("invalid");
  }
  try {
    return await withAdminOperation(session, correlationId, async (client) => {
      const updated = await client.query<{ tenantId: string }>(
        `UPDATE public.onboarding_checklist_items SET status=$4,
           blocked_reason=CASE WHEN $4='blocked' THEN $5 ELSE NULL END,
           completed_at=CASE WHEN $4 IN ('completed','not_applicable')
             THEN transaction_timestamp() ELSE NULL END,
           completed_by_user_id=CASE WHEN $4 IN ('completed','not_applicable')
             THEN $6 ELSE NULL END,version=version+1
         WHERE onboarding_case_id=$1 AND item_key=$2 AND version=$3
         RETURNING tenant_id AS "tenantId"`,
        [caseId,itemKey,expectedVersion,status,blockedReason,session.userId],
      );
      if (!updated.rows[0]) throw new OnboardingOperationError("conflict");
      await audit(client, {
        tenantId: updated.rows[0].tenantId,
        action: "onboarding_checklist_changed",
        resourceType: "onboarding_checklist",
        resourceId: `${caseId}:${itemKey}`,
        correlationId,
        next: { status },
      });
      return caseId;
    });
  } catch (error) {
    throw mapError(error);
  }
}

export async function requestClientApproval(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const caseId = uuid(form.get("case_id"));
  const expectedVersion = integer(form.get("version"));
  const key = uuid(form.get("idempotency_key"));
  try {
    return await withAdminOperation(session, correlationId, async (client) => {
      const result = await client.query<{
        tenantId: string; siteId: string; status: OnboardingCaseStatus;
        version: number; clientUserId: string | null; conversationId: string;
        draftId: string; draftRevision: number; content: unknown;
        schemaKey: string; schemaVersion: number; templateVersionId: string;
        rendererKey: string;
      }>(
        `SELECT case_record.tenant_id AS "tenantId",
           case_record.site_id AS "siteId",case_record.status,case_record.version,
           case_record.primary_client_user_id AS "clientUserId",
           case_record.linked_conversation_id AS "conversationId",
           draft.id AS "draftId",draft.revision AS "draftRevision",draft.content,
           draft.schema_key AS "schemaKey",draft.schema_version AS "schemaVersion",
           assignment.template_version_id AS "templateVersionId",
           version.renderer_key AS "rendererKey"
         FROM public.onboarding_cases case_record
         JOIN public.site_content_drafts draft ON draft.site_id=case_record.site_id
         JOIN public.site_template_assignments assignment
           ON assignment.site_id=case_record.site_id AND assignment.status='active'
         JOIN public.template_versions version
           ON version.id=assignment.template_version_id
         WHERE case_record.id=$1 FOR UPDATE OF case_record,draft,assignment`,
        [caseId],
      );
      const row = result.rows[0];
      if (!row) throw new OnboardingOperationError("not_found");
      if (row.version !== expectedVersion || row.status !== "internal_review" ||
          !row.clientUserId || !row.conversationId ||
          row.schemaKey !== "restaurant.v2" || row.schemaVersion !== 2 ||
          !rendererIsCompatible(
            row.rendererKey,
            "restaurant",
            row.schemaKey,
            row.schemaVersion,
          )) {
        throw new OnboardingOperationError("conflict");
      }
      const content = validateRestaurantV2Content(row.content, "publication");
      const checksum = onboardingContentChecksum({
        siteId: row.siteId,
        draftRevision: row.draftRevision,
        templateVersionId: row.templateVersionId,
        schemaKey: row.schemaKey,
        schemaVersion: row.schemaVersion,
        content,
      });
      const replay = await client.query<{ id: string }>(
        `SELECT id FROM public.onboarding_client_approvals
         WHERE onboarding_case_id=$1 AND idempotency_key=$2`,
        [caseId,key],
      );
      if (replay.rows[0]) return caseId;
      await client.query(
        `UPDATE public.onboarding_client_approvals SET
           status='invalidated',invalidated_at=transaction_timestamp(),
           invalidation_reason='superseded',version=version+1
         WHERE onboarding_case_id=$1 AND status IN ('pending','approved')`,
        [caseId],
      );
      await client.query(
        `INSERT INTO public.onboarding_client_approvals(
           onboarding_case_id,tenant_id,site_id,draft_revision,
           template_version_id,schema_key,schema_version,content_checksum,
           status,idempotency_key
         ) VALUES($1,$2,$3,$4,$5,'restaurant.v2',2,$6,'pending',$7)`,
        [
          caseId,row.tenantId,row.siteId,row.draftRevision,
          row.templateVersionId,checksum,key,
        ],
      );
      await insertLinkedMessage(client, {
        tenantId: row.tenantId,
        conversationId: row.conversationId,
        senderUserId: session.userId,
        senderScope: "nexi_admin",
        body: "Tu vista previa está disponible para revisión y aprobación dentro de nexi.",
        key: deterministicUuid(`onboarding:approval-message:${key}`),
        status: "awaiting_client",
        recipientUserId: row.clientUserId,
        path: `/cuenta/incorporacion/${caseId}`,
      });
      await client.query(
        `UPDATE public.onboarding_cases SET
           status='waiting_client_approval',current_step='client_approval',
           internal_reviewed_at=COALESCE(internal_reviewed_at,transaction_timestamp()),
           sent_for_client_approval_at=transaction_timestamp(),
           version=version+1 WHERE id=$1`,
        [caseId],
      );
      await client.query(
        `UPDATE public.onboarding_checklist_items SET status='completed',
           completed_at=transaction_timestamp(),completed_by_user_id=$2,
           version=version+1
         WHERE onboarding_case_id=$1 AND item_key='internal_review_complete'`,
        [caseId,session.userId],
      );
      await audit(client, {
        tenantId: row.tenantId,
        action: "onboarding_approval_requested",
        resourceType: "onboarding_approval",
        resourceId: caseId,
        correlationId,
        metadata: { draft_revision: row.draftRevision },
      });
      return caseId;
    });
  } catch (error) {
    throw mapError(error);
  }
}

export async function decideClientApproval(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const caseId = uuid(form.get("case_id"));
  const decision = String(form.get("decision") || "");
  const note = clean(form.get("decision_note"), 2, 1000, true);
  const key = uuid(form.get("idempotency_key"));
  if (!["approve","request_changes"].includes(decision) ||
      (decision === "request_changes" && !note)) {
    throw new OnboardingOperationError("invalid");
  }
  try {
    return await withClientOperation(session, correlationId, async (client) => {
      const result = await client.query<{
        tenantId: string; siteId: string; status: OnboardingCaseStatus;
        conversationId: string; approvalId: string; approvalStatus: string;
        draftRevision: number; templateVersionId: string; schemaKey: string;
        schemaVersion: number; storedChecksum: string; content: unknown;
        currentDraftRevision: number; currentTemplateVersionId: string;
      }>(
        `SELECT case_record.tenant_id AS "tenantId",
           case_record.site_id AS "siteId",case_record.status,
           case_record.linked_conversation_id AS "conversationId",
           approval.id AS "approvalId",approval.status AS "approvalStatus",
           approval.draft_revision AS "draftRevision",
           approval.template_version_id AS "templateVersionId",
           approval.schema_key AS "schemaKey",
           approval.schema_version AS "schemaVersion",
           approval.content_checksum AS "storedChecksum",draft.content,
           draft.revision AS "currentDraftRevision",
           assignment.template_version_id AS "currentTemplateVersionId"
         FROM public.onboarding_cases case_record
         JOIN public.onboarding_client_approvals approval
           ON approval.onboarding_case_id=case_record.id
          AND approval.status IN ('pending','approved','changes_requested')
         JOIN public.site_content_drafts draft ON draft.site_id=case_record.site_id
         JOIN public.site_template_assignments assignment
           ON assignment.site_id=case_record.site_id AND assignment.status='active'
         WHERE case_record.id=$1
           AND case_record.tenant_id=app_context.current_tenant_id()
         ORDER BY approval.created_at DESC LIMIT 1
         FOR UPDATE OF case_record,approval,draft,assignment`,
        [caseId],
      );
      const row = result.rows[0];
      if (!row) throw new OnboardingOperationError("not_found");
      if (
        row.approvalStatus === "approved" && decision === "approve"
      ) return caseId;
      if (row.approvalStatus !== "pending" ||
          row.status !== "waiting_client_approval") {
        throw new OnboardingOperationError("conflict");
      }
      const content = validateRestaurantV2Content(row.content, "publication");
      const checksum = onboardingContentChecksum({
        siteId: row.siteId,
        draftRevision: row.currentDraftRevision,
        templateVersionId: row.currentTemplateVersionId,
        schemaKey: row.schemaKey,
        schemaVersion: row.schemaVersion,
        content,
      });
      if (
        row.currentDraftRevision !== row.draftRevision ||
        row.currentTemplateVersionId !== row.templateVersionId ||
        checksum !== row.storedChecksum
      ) {
        await client.query(
          `UPDATE public.onboarding_client_approvals SET
             status='invalidated',invalidated_at=transaction_timestamp(),
             invalidation_reason='revision_mismatch',version=version+1
           WHERE id=$1`,
          [row.approvalId],
        );
        throw new OnboardingOperationError("conflict");
      }
      const status = decision === "approve" ? "approved" : "changes_requested";
      await client.query(
        `UPDATE public.onboarding_client_approvals SET status=$2,
           decision_note=$3,decided_at=transaction_timestamp(),
           decided_by_user_id=app_context.current_user_id(),version=version+1
         WHERE id=$1`,
        [row.approvalId,status,note],
      );
      await client.query(
        `UPDATE public.onboarding_cases SET status=$2,
           current_step=CASE WHEN $2='preparing' THEN 'content'
             ELSE 'client_approval' END,
           approved_at=CASE WHEN $2='waiting_client_approval'
             THEN transaction_timestamp() ELSE NULL END,
           version=version+1 WHERE id=$1`,
        [
          caseId,
          decision === "approve" ? "waiting_client_approval" : "preparing",
        ],
      );
      if (decision === "approve") {
        await client.query(
          `UPDATE public.onboarding_checklist_items SET status='completed',
             completed_at=transaction_timestamp(),
             completed_by_user_id=app_context.current_user_id(),
             version=version+1
           WHERE onboarding_case_id=$1 AND item_key='client_approval_valid'`,
          [caseId],
        );
      } else {
        await insertLinkedMessage(client, {
          tenantId: row.tenantId,
          conversationId: row.conversationId,
          senderUserId: session.userId,
          senderScope: "client_admin",
          body: note!,
          key,
          status: "awaiting_nexi",
          path: `/nexi-interno/onboarding/casos/${caseId}`,
        });
      }
      await audit(client, {
        tenantId: row.tenantId,
        action: decision === "approve"
          ? "onboarding_approval_granted"
          : "onboarding_changes_requested",
        resourceType: "onboarding_approval",
        resourceId: row.approvalId,
        correlationId,
      });
      return caseId;
    });
  } catch (error) {
    throw mapError(error);
  }
}

export async function markReadyToPublish(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const caseId = uuid(form.get("case_id"));
  const expectedVersion = integer(form.get("version"));
  try {
    return await withAdminOperation(session, correlationId, async (client) => {
      const result = await client.query<{
        tenantId: string; siteId: string; version: number; status: string;
        tenantStatus: string; siteStatus: string; membershipStatus: string | null;
        planStatus: string; templateVersionId: string; templateStatus: string;
        rendererKey: string; draftRevision: number; schemaKey: string;
        schemaVersion: number; content: unknown; approvalId: string;
        approvalStatus: string; approvalRevision: number; approvalTemplateId: string;
        approvalChecksum: string; domainReady: boolean;
      }>(
        `SELECT case_record.tenant_id AS "tenantId",
           case_record.site_id AS "siteId",case_record.version,case_record.status,
           tenant.status AS "tenantStatus",site.status AS "siteStatus",
           membership.status AS "membershipStatus",
           plan_assignment.status AS "planStatus",
           assignment.template_version_id AS "templateVersionId",
           template_version.status AS "templateStatus",
           template_version.renderer_key AS "rendererKey",
           draft.revision AS "draftRevision",draft.schema_key AS "schemaKey",
           draft.schema_version AS "schemaVersion",draft.content,
           approval.id AS "approvalId",approval.status AS "approvalStatus",
           approval.draft_revision AS "approvalRevision",
           approval.template_version_id AS "approvalTemplateId",
           approval.content_checksum AS "approvalChecksum",
           EXISTS(
             SELECT 1 FROM public.site_domains domain
             WHERE domain.site_id=case_record.site_id
               AND domain.status='active' AND domain.verification_status='verified'
           ) AS "domainReady"
         FROM public.onboarding_cases case_record
         JOIN public.tenants tenant ON tenant.id=case_record.tenant_id
         JOIN public.sites site ON site.id=case_record.site_id
         LEFT JOIN public.tenant_memberships membership
           ON membership.tenant_id=case_record.tenant_id
          AND membership.user_id=case_record.primary_client_user_id
         JOIN public.tenant_plan_assignments plan_assignment
           ON plan_assignment.id=case_record.target_plan_assignment_id
         JOIN public.site_template_assignments assignment
           ON assignment.site_id=case_record.site_id AND assignment.status='active'
         JOIN public.template_versions template_version
           ON template_version.id=assignment.template_version_id
         JOIN public.site_content_drafts draft ON draft.site_id=case_record.site_id
         JOIN public.onboarding_client_approvals approval
           ON approval.onboarding_case_id=case_record.id
          AND approval.status='approved'
         WHERE case_record.id=$1
         FOR UPDATE OF case_record,site,draft,assignment,approval`,
        [caseId],
      );
      const row = result.rows[0];
      if (!row) throw new OnboardingOperationError("not_found");
      if (
        row.version !== expectedVersion ||
        row.status !== "waiting_client_approval" ||
        row.tenantStatus !== "active" ||
        !["preparing","active"].includes(row.siteStatus) ||
        row.membershipStatus !== "active" ||
        row.planStatus !== "active" ||
        !["active","deprecated"].includes(row.templateStatus) ||
        !row.domainReady ||
        row.approvalStatus !== "approved" ||
        row.approvalRevision !== row.draftRevision ||
        row.approvalTemplateId !== row.templateVersionId ||
        row.schemaKey !== "restaurant.v2" ||
        row.schemaVersion !== 2 ||
        !rendererIsCompatible(
          row.rendererKey,
          "restaurant",
          row.schemaKey,
          row.schemaVersion,
        )
      ) {
        throw new OnboardingOperationError("incomplete");
      }
      const content = validateRestaurantV2Content(row.content, "publication");
      const checksum = onboardingContentChecksum({
        siteId: row.siteId,
        draftRevision: row.draftRevision,
        templateVersionId: row.templateVersionId,
        schemaKey: row.schemaKey,
        schemaVersion: row.schemaVersion,
        content,
      });
      if (checksum !== row.approvalChecksum) {
        throw new OnboardingOperationError("conflict");
      }
      const assets = await client.query<{ invalid: string }>(
        `SELECT reference.asset_id::text AS invalid
         FROM public.content_media_references reference
         JOIN public.site_content_drafts draft ON draft.id=reference.draft_id
         LEFT JOIN public.media_assets asset ON asset.id=reference.asset_id
         WHERE draft.site_id=$1 AND reference.owner_kind='draft'
           AND (asset.id IS NULL OR asset.status<>'ready'
             OR asset.tenant_id<>$2 OR asset.site_id<>$1)
         LIMIT 1`,
        [row.siteId,row.tenantId],
      );
      if (assets.rows[0]) throw new OnboardingOperationError("incomplete","media");
      const blocking = await client.query<{ key: string }>(
        `SELECT item_key AS key FROM public.onboarding_checklist_items
         WHERE onboarding_case_id=$1 AND required
           AND item_key NOT IN ('publication_ready','publication_verified')
           AND status NOT IN ('completed','not_applicable')
         LIMIT 1`,
        [caseId],
      );
      if (blocking.rows[0]) {
        throw new OnboardingOperationError("incomplete",blocking.rows[0].key);
      }
      await client.query(
        `UPDATE public.onboarding_cases SET status='ready_to_publish',
           current_step='publication',ready_to_publish_at=transaction_timestamp(),
           version=version+1 WHERE id=$1`,
        [caseId],
      );
      await client.query(
        `UPDATE public.onboarding_checklist_items SET status='completed',
           completed_at=transaction_timestamp(),completed_by_user_id=$2,
           version=version+1
         WHERE onboarding_case_id=$1 AND item_key='publication_ready'`,
        [caseId,session.userId],
      );
      await client.query(
        `INSERT INTO public.onboarding_state_history(
           onboarding_case_id,tenant_id,from_status,to_status,actor_user_id,
           correlation_id,reason_code
         ) VALUES($1,$2,'waiting_client_approval','ready_to_publish',$3,$4,'validated')`,
        [caseId,row.tenantId,session.userId,correlationId],
      );
      await audit(client, {
        tenantId: row.tenantId,
        action: "onboarding_ready_to_publish",
        resourceType: "onboarding_case",
        resourceId: caseId,
        correlationId,
      });
      return caseId;
    });
  } catch (error) {
    throw mapError(error);
  }
}

export async function publishOnboarding(
  session: Readonly<AuthSession>,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const caseId = uuid(form.get("case_id"));
  const expectedVersion = integer(form.get("version"));
  const publicationKey = uuid(form.get("idempotency_key"));
  let publicationId: string;
  let tenantId: string;
  let siteSlug: string;
  try {
    const prepared = await withAdminOperation(
      session,
      correlationId,
      async (client) => {
        const result = await client.query<{
          tenantId: string;
          siteId: string;
          siteSlug: string;
          version: number;
          status: string;
          tenantStatus: string;
          siteStatus: string;
          membershipStatus: string | null;
          planStatus: string;
          templateVersionId: string;
          templateStatus: string;
          rendererKey: string;
          draftRevision: number;
          schemaKey: string;
          schemaVersion: number;
          content: unknown;
          approvalRevision: number;
          approvalTemplateId: string;
          approvalChecksum: string;
          existingPublicationId: string | null;
          domainReady: boolean;
        }>(
          `SELECT case_record.tenant_id AS "tenantId",
             case_record.site_id AS "siteId",site.slug AS "siteSlug",
             case_record.version,case_record.status,
             tenant.status AS "tenantStatus",site.status AS "siteStatus",
             membership.status AS "membershipStatus",
             plan_assignment.status AS "planStatus",
             assignment.template_version_id AS "templateVersionId",
             template_version.status AS "templateStatus",
             template_version.renderer_key AS "rendererKey",
             draft.revision AS "draftRevision",draft.schema_key AS "schemaKey",
             draft.schema_version AS "schemaVersion",draft.content,
             approval.draft_revision AS "approvalRevision",
             approval.template_version_id AS "approvalTemplateId",
             approval.content_checksum AS "approvalChecksum",
             case_record.publication_id AS "existingPublicationId",
             EXISTS(
               SELECT 1 FROM public.site_domains domain
               WHERE domain.site_id=case_record.site_id
                 AND domain.status='active'
                 AND domain.verification_status='verified'
             ) AS "domainReady"
           FROM public.onboarding_cases case_record
           JOIN public.tenants tenant ON tenant.id=case_record.tenant_id
           JOIN public.sites site ON site.id=case_record.site_id
           LEFT JOIN public.tenant_memberships membership
             ON membership.tenant_id=case_record.tenant_id
            AND membership.user_id=case_record.primary_client_user_id
           JOIN public.tenant_plan_assignments plan_assignment
             ON plan_assignment.id=case_record.target_plan_assignment_id
           JOIN public.site_template_assignments assignment
             ON assignment.site_id=case_record.site_id AND assignment.status='active'
           JOIN public.template_versions template_version
             ON template_version.id=assignment.template_version_id
           JOIN public.site_content_drafts draft ON draft.site_id=case_record.site_id
           JOIN public.onboarding_client_approvals approval
             ON approval.onboarding_case_id=case_record.id
            AND approval.status='approved'
           WHERE case_record.id=$1
           FOR UPDATE OF case_record,site,draft,assignment,approval`,
          [caseId],
        );
        const row = result.rows[0];
        if (!row) throw new OnboardingOperationError("not_found");
        if (
          row.existingPublicationId &&
          ["ready_to_publish", "published"].includes(row.status)
        ) {
          return {
            tenantId: row.tenantId,
            siteSlug: row.siteSlug,
            publicationId: row.existingPublicationId,
          };
        }
        if (
          row.status !== "ready_to_publish" ||
          (!row.existingPublicationId && row.version !== expectedVersion) ||
          row.tenantStatus !== "active" ||
          !["preparing","active"].includes(row.siteStatus) ||
          row.membershipStatus !== "active" ||
          row.planStatus !== "active" ||
          !["active","deprecated"].includes(row.templateStatus) ||
          !row.domainReady ||
          row.approvalRevision !== row.draftRevision ||
          row.approvalTemplateId !== row.templateVersionId ||
          row.schemaKey !== "restaurant.v2" ||
          row.schemaVersion !== 2 ||
          !rendererIsCompatible(
            row.rendererKey,
            "restaurant",
            row.schemaKey,
            row.schemaVersion,
          )
        ) {
          throw new OnboardingOperationError("incomplete");
        }
        const content = validateRestaurantV2Content(row.content, "publication");
        const checksum = onboardingContentChecksum({
          siteId: row.siteId,
          draftRevision: row.draftRevision,
          templateVersionId: row.templateVersionId,
          schemaKey: row.schemaKey,
          schemaVersion: row.schemaVersion,
          content,
        });
        if (checksum !== row.approvalChecksum) {
          throw new OnboardingOperationError("conflict");
        }
        const blocking = await client.query(
          `SELECT 1 FROM public.onboarding_checklist_items
           WHERE onboarding_case_id=$1 AND required
             AND item_key<>'publication_verified'
             AND status NOT IN ('completed','not_applicable') LIMIT 1`,
          [caseId],
        );
        if (blocking.rowCount) throw new OnboardingOperationError("incomplete");
        const publication = await publishContentTransaction(client, {
          tenantId: row.tenantId,
          actorUserId: session.userId,
          siteId: row.siteId,
          expectedRevision: row.draftRevision,
          idempotencyKey: publicationKey,
          allowedSiteStatuses: ["preparing","active"],
        });
        if (publication.rejected || !publication.publicationId) {
          throw new OnboardingOperationError(
            publication.rejected === "revision" ? "conflict" : "incomplete",
            publication.field,
          );
        }
        await client.query(
          `UPDATE public.onboarding_cases SET publication_id=$2,
             version=version+1 WHERE id=$1 AND publication_id IS NULL`,
          [caseId,publication.publicationId],
        );
        await audit(client, {
          tenantId: row.tenantId,
          action: "content_published",
          resourceType: "content_publication",
          resourceId: publication.publicationId,
          correlationId,
          metadata: {
            publication_number: publication.publicationNumber ?? null,
            draft_revision: publication.draftRevision ?? null,
            media_count: publication.mediaCount ?? null,
            source: "onboarding",
          },
        });
        return {
          tenantId: row.tenantId,
          siteSlug: row.siteSlug,
          publicationId: publication.publicationId,
        };
      },
    );
    tenantId = prepared.tenantId;
    siteSlug = prepared.siteSlug;
    publicationId = prepared.publicationId;
  } catch (error) {
    throw mapError(error);
  }

  const resolved = await resolvePublicSite({ siteSlug });
  if (
    !resolved ||
    resolved.publicState !== "published" ||
    resolved.publicationId !== publicationId ||
    !resolved.content ||
    !resolved.rendererKey
  ) {
    throw new OnboardingOperationError("incomplete","verification");
  }

  try {
    await withAdminOperation(session, correlationId, async (client) => {
      const current = await client.query<{ status: string; publicationId: string | null }>(
        `SELECT status,publication_id AS "publicationId"
         FROM public.onboarding_cases WHERE id=$1 FOR UPDATE`,
        [caseId],
      );
      if (!current.rows[0] || current.rows[0].publicationId !== publicationId) {
        throw new OnboardingOperationError("conflict");
      }
      if (current.rows[0].status === "published") return;
      if (current.rows[0].status !== "ready_to_publish") {
        throw new OnboardingOperationError("conflict");
      }
      const verification = {
        public_state: resolved.publicState,
        publication_id_matches: true,
        renderer_valid: true,
        content_valid: true,
        media_count: Object.keys(resolved.media ?? {}).length,
      };
      await client.query(
        `UPDATE public.onboarding_cases SET status='published',
           publication_id=$2,published_at=transaction_timestamp(),
           published_by_user_id=$3,verification_result=$4::jsonb,
           verification_timestamp=transaction_timestamp(),
           public_reference=$5,current_step='publication',version=version+1
         WHERE id=$1`,
        [
          caseId,publicationId,session.userId,JSON.stringify(verification),
          `/sitios/${siteSlug}`,
        ],
      );
      await client.query(
        `UPDATE public.onboarding_checklist_items SET status='completed',
           completed_at=transaction_timestamp(),completed_by_user_id=$2,
           version=version+1
         WHERE onboarding_case_id=$1
           AND item_key IN ('publication_ready','publication_verified')`,
        [caseId,session.userId],
      );
      await client.query(
        `INSERT INTO public.onboarding_state_history(
           onboarding_case_id,tenant_id,from_status,to_status,actor_user_id,
           correlation_id,reason_code
         ) VALUES($1,$2,'ready_to_publish','published',$3,$4,'verified')`,
        [caseId,tenantId,session.userId,correlationId],
      );
      await audit(client, {
        tenantId,
        action: "onboarding_verified",
        resourceType: "onboarding_case",
        resourceId: caseId,
        correlationId,
        metadata: { publication_id_matches: true },
      });
      await audit(client, {
        tenantId,
        action: "onboarding_published",
        resourceType: "onboarding_case",
        resourceId: caseId,
        correlationId,
        metadata: { verification: "passed" },
      });
    });
    return caseId;
  } catch (error) {
    throw mapError(error);
  }
}
