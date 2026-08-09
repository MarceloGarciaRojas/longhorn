import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AuthSession } from "@/src/auth/types";
import { recordClientEvent } from "@/src/client-portal/client-repository.server";
import { getAppConfig } from "@/src/config/app-config";
import { withApplicationDatabase } from "@/src/db/application-database.server";
import { createLogger } from "@/src/observability/logger";
import { withAdminOperation, withClientOperation } from "@/src/operations/contexts.server";
import {
  mapOperationError,
  OperationValidationError,
  uuid,
} from "@/src/operations/validation";
import { normalizeHostname } from "@/src/tenancy/public-host";
import { rendererIsCompatible } from "./renderer-manifest";
import {
  rendererPublicationIsAllowed,
  templateCatalogOrder,
  templateSelectionIsAllowed,
} from "./template-capabilities";
import {
  contentMediaReferences,
  copyDraftMediaToPublication,
  copyPublicationMediaReferences,
  replaceDraftMediaReferences,
} from "./media-references.server";
import {
  parseContentForSchema,
  validateContentForSchema,
} from "./schema-dispatch";
import { mediaManifestForOwner } from "@/src/media/service.server";
import {
  emptyRestaurantContent,
  RestaurantContentValidationError,
} from "./restaurant-schema";
import {
  RESTAURANT_SCHEMA_KEY,
  RESTAURANT_SCHEMA_VERSION,
  type ClientContentWorkspace,
  type ContentDraft,
  type ContentPublication,
  type PublicSiteResolution,
  type RestaurantAnyContent,
  type RestaurantContent,
  type TemplateAssignment,
  type TemplateOption,
  RESTAURANT_V2_SCHEMA_KEY,
  RESTAURANT_V2_SCHEMA_VERSION,
  RESTAURANT_CLASSIC_V2_RENDERER_KEY,
} from "./types";
import { migrateRestaurantV1ToV2 } from "./restaurant-v2-schema";

function pageId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function integer(
  value: FormDataEntryValue | null,
  minimum = 1,
): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum) {
    throw new OperationValidationError("invalid");
  }
  return result;
}

async function clientAudit(
  client: PoolClient,
  session: AuthSession,
  correlationId: string,
  action:
    | "content_draft_saved"
    | "content_edit_conflict"
    | "content_previewed"
    | "content_published"
    | "content_restored"
    | "content_publish_rejected"
    | "content_access_denied",
  resourceType: "content_draft" | "content_publication" | "public_site",
  resourceId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await recordClientEvent(client, {
    session,
    action,
    resourceType,
    resourceId,
    correlationId,
    metadata,
  });
}

async function adminAudit(
  client: PoolClient,
  input: {
    tenantId: string;
    action:
      | "template_assigned"
      | "template_version_changed"
      | "content_initialized"
      | "renderer_unknown"
      | "content_access_denied";
    resourceType: "template_assignment" | "template_version" | "content_draft";
    resourceId: string;
    correlationId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `SELECT app_private.operation_record_admin_event(
       $1,$2,$3,$4,$5,NULL,NULL,$6::jsonb
     )`,
    [
      input.tenantId,
      input.action,
      input.resourceType,
      input.resourceId,
      input.correlationId,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

const ASSIGNMENT_SELECT = `SELECT
  assignment.id,assignment.tenant_id AS "tenantId",
  assignment.site_id AS "siteId",
  assignment.template_version_id AS "templateVersionId",
  template.display_name AS "templateName",
  version.version AS "templateVersion",
  version.renderer_key AS "rendererKey",
  assignment.schema_key AS "schemaKey",
  assignment.schema_version AS "schemaVersion",
  assignment.status,assignment.version
FROM public.site_template_assignments assignment
JOIN public.template_versions version ON version.id=assignment.template_version_id
JOIN public.templates template ON template.id=version.template_id`;

const PUBLICATION_SELECT = `SELECT
  publication.id,publication.site_id AS "siteId",
  publication.template_version_id AS "templateVersionId",
  template.display_name AS "templateName",
  version.version AS "templateVersion",
  publication.schema_key AS "schemaKey",
  publication.schema_version AS "schemaVersion",
  publication.content_snapshot AS content,
  publication.publication_number AS "publicationNumber",
  COALESCE(account.display_name,'Equipo nexi') AS "publishedByName",
  publication.restored_from_publication_id AS "restoredFromPublicationId",
  publication.published_at AS "publishedAt",
  (site.current_publication_id=publication.id) AS "isCurrent"
FROM public.site_content_publications publication
JOIN public.sites site ON site.id=publication.site_id
JOIN public.template_versions version ON version.id=publication.template_version_id
JOIN public.templates template ON template.id=version.template_id
LEFT JOIN public.users account ON account.id=publication.published_by_user_id`;

export async function adminTemplateOptions(
  session: AuthSession,
): Promise<TemplateOption[]> {
  return withAdminOperation(session, pageId("admin-template-options"), async (client) => {
    const result = await client.query<TemplateOption>(
      `SELECT version.id,template.id AS "templateId",template.key AS "templateKey",
         template.display_name AS "displayName",template.description,
         version.version,version.renderer_key AS "rendererKey",
         version.content_schema_key AS "schemaKey",
         version.minimum_schema_version AS "minimumSchemaVersion",
         version.maximum_schema_version AS "maximumSchemaVersion",version.status,
         version.preview_key AS "previewKey"
       FROM public.template_versions version
       JOIN public.templates template ON template.id=version.template_id
       WHERE template.status='active' AND version.status IN ('active','deprecated')
       ORDER BY template.display_name,version.version DESC`,
    );
    return result.rows.sort(templateCatalogOrder);
  });
}

export async function adminTemplateAssignment(
  session: AuthSession,
  siteId: string,
): Promise<TemplateAssignment | null> {
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) return null;
  return withAdminOperation(session, pageId("admin-template-assignment"), async (client) => {
    const result = await client.query<TemplateAssignment>(
      `${ASSIGNMENT_SELECT} WHERE assignment.site_id=$1`,
      [siteId],
    );
    return result.rows[0] ?? null;
  });
}

export async function adminContentDraftState(
  session: AuthSession,
  siteId: string,
): Promise<{ id: string; revision: number } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) return null;
  return withAdminOperation(session, pageId("admin-content-draft"), async (client) => {
    const result = await client.query<{ id: string; revision: number }>(
      `SELECT id,revision FROM public.site_content_drafts WHERE site_id=$1`,
      [siteId],
    );
    return result.rows[0] ?? null;
  });
}

export async function adminAssignTemplate(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const siteId = uuid(form.get("site_id"));
  const templateVersionId = uuid(form.get("template_version_id"));
  const idempotencyKey = uuid(form.get("idempotency_key"));
  const expectedVersion = form.get("assignment_version")
    ? integer(form.get("assignment_version"))
    : null;
  try {
    const outcome = await withAdminOperation(session, correlationId, async (client) => {
      const site = await client.query<{ tenantId: string }>(
        `SELECT tenant_id AS "tenantId" FROM public.sites
         WHERE id=$1 AND status IN ('preparing','active','suspended')
           AND deleted_at IS NULL FOR UPDATE`,
        [siteId],
      );
      if (!site.rows[0]) throw new OperationValidationError("not_found");
      const option = await client.query<TemplateOption>(
        `SELECT version.id,template.id AS "templateId",template.key AS "templateKey",
           template.display_name AS "displayName",template.description,
           version.version,version.renderer_key AS "rendererKey",
           version.content_schema_key AS "schemaKey",
           version.minimum_schema_version AS "minimumSchemaVersion",
           version.maximum_schema_version AS "maximumSchemaVersion",version.status,
           version.preview_key AS "previewKey"
         FROM public.template_versions version
         JOIN public.templates template ON template.id=version.template_id
         WHERE version.id=$1 AND version.status='active' AND template.status='active'`,
        [templateVersionId],
      );
      const selected = option.rows[0];
      if (!selected) throw new OperationValidationError("not_found");
      if (!rendererIsCompatible(
        selected.rendererKey,
        selected.schemaKey,
        selected.minimumSchemaVersion,
      )) {
        await adminAudit(client, {
          tenantId: site.rows[0].tenantId,
          action: "renderer_unknown",
          resourceType: "template_version",
          resourceId: templateVersionId,
          correlationId,
        });
        return { rejected: true as const };
      }
      if (!templateSelectionIsAllowed(selected)) {
        throw new OperationValidationError("denied");
      }
      const replay = await client.query<{ siteId: string }>(
        `SELECT site_id AS "siteId" FROM public.site_template_assignments
         WHERE idempotency_key=$1`,
        [idempotencyKey],
      );
      if (replay.rows[0]) return { rejected: false as const, siteId: replay.rows[0].siteId };
      const current = await client.query<TemplateAssignment>(
        `${ASSIGNMENT_SELECT} WHERE assignment.site_id=$1 FOR UPDATE OF assignment`,
        [siteId],
      );
      const existingDraft = await client.query<{
        schemaKey: string;
        schemaVersion: number;
      }>(
        `SELECT schema_key AS "schemaKey",schema_version AS "schemaVersion"
         FROM public.site_content_drafts WHERE site_id=$1`,
        [siteId],
      );
      if (
        existingDraft.rows[0] &&
        (
          existingDraft.rows[0].schemaKey !== selected.schemaKey ||
          existingDraft.rows[0].schemaVersion < selected.minimumSchemaVersion ||
          existingDraft.rows[0].schemaVersion > selected.maximumSchemaVersion
        )
      ) {
        throw new OperationValidationError("conflict");
      }
      if (current.rows[0]?.templateVersionId === templateVersionId) {
        return { rejected: false as const, siteId };
      }
      let assignmentId: string;
      let action: "template_assigned" | "template_version_changed";
      if (current.rows[0]) {
        if (expectedVersion !== current.rows[0].version) {
          throw new OperationValidationError("conflict");
        }
        const updated = await client.query<{ id: string }>(
          `UPDATE public.site_template_assignments SET
             template_version_id=$2,schema_key=$3,schema_version=$4,
             idempotency_key=$5,version=version+1,status='active'
           WHERE site_id=$1 AND version=$6 RETURNING id`,
          [
            siteId,
            templateVersionId,
            selected.schemaKey,
            selected.minimumSchemaVersion,
            idempotencyKey,
            expectedVersion,
          ],
        );
        if (!updated.rows[0]) throw new OperationValidationError("conflict");
        assignmentId = updated.rows[0].id;
        action = "template_version_changed";
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO public.site_template_assignments(
             tenant_id,site_id,template_version_id,schema_key,schema_version,
             assigned_by_user_id,idempotency_key
           ) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [
            site.rows[0].tenantId,
            siteId,
            templateVersionId,
            selected.schemaKey,
            selected.minimumSchemaVersion,
            session.userId,
            idempotencyKey,
          ],
        );
        assignmentId = inserted.rows[0].id;
        action = "template_assigned";
      }
      await adminAudit(client, {
        tenantId: site.rows[0].tenantId,
        action,
        resourceType: "template_assignment",
        resourceId: assignmentId,
        correlationId,
        metadata: { template_version: selected.version, schema_key: selected.schemaKey },
      });
      return { rejected: false as const, siteId };
    });
    if (outcome.rejected) throw new OperationValidationError("invalid");
    return outcome.siteId;
  } catch (error) {
    throw mapOperationError(error);
  }
}

export async function adminInitializeContent(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const siteId = uuid(form.get("site_id"));
  const idempotencyKey = uuid(form.get("idempotency_key"));
  try {
    return await withAdminOperation(session, correlationId, async (client) => {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM public.site_content_drafts WHERE site_id=$1`,
        [siteId],
      );
      if (existing.rows[0]) return siteId;
      const context = await client.query<{
        tenantId: string;
        siteName: string;
        schemaKey: string;
        schemaVersion: number;
      }>(
        `SELECT site.tenant_id AS "tenantId",site.display_name AS "siteName",
           assignment.schema_key AS "schemaKey",
           assignment.schema_version AS "schemaVersion"
         FROM public.sites site
         JOIN public.site_template_assignments assignment
           ON assignment.site_id=site.id AND assignment.status='active'
         WHERE site.id=$1 AND site.status IN ('preparing','active')
           AND site.deleted_at IS NULL FOR UPDATE OF site`,
        [siteId],
      );
      const row = context.rows[0];
      if (!row || row.schemaKey !== RESTAURANT_SCHEMA_KEY ||
          row.schemaVersion !== RESTAURANT_SCHEMA_VERSION) {
        throw new OperationValidationError("not_found");
      }
      const content = emptyRestaurantContent({ businessName: row.siteName });
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.site_content_drafts(
           tenant_id,site_id,schema_key,schema_version,content,
           created_by_user_id,updated_by_user_id,last_idempotency_key
         ) VALUES($1,$2,$3,$4,$5::jsonb,$6,$6,$7)
         ON CONFLICT(site_id) DO NOTHING RETURNING id`,
        [
          row.tenantId,
          siteId,
          row.schemaKey,
          row.schemaVersion,
          JSON.stringify(content),
          session.userId,
          idempotencyKey,
        ],
      );
      if (inserted.rows[0]) {
        await adminAudit(client, {
          tenantId: row.tenantId,
          action: "content_initialized",
          resourceType: "content_draft",
          resourceId: inserted.rows[0].id,
          correlationId,
          metadata: { schema_key: row.schemaKey, schema_version: row.schemaVersion },
        });
      }
      return siteId;
    });
  } catch (error) {
    throw mapOperationError(error);
  }
}

async function loadClientWorkspace(
  client: PoolClient,
  siteId: string,
): Promise<ClientContentWorkspace | null> {
  const site = await client.query<{
    siteId: string;
    siteName: string;
    siteStatus: string;
    siteSlug: string;
  }>(
    `SELECT id AS "siteId",display_name AS "siteName",status AS "siteStatus",
       slug AS "siteSlug"
     FROM public.sites WHERE id=$1
       AND tenant_id=app_context.current_tenant_id() AND deleted_at IS NULL`,
    [siteId],
  );
  if (!site.rows[0]) return null;
  const assignment = await client.query<TemplateAssignment>(
      `${ASSIGNMENT_SELECT}
       WHERE assignment.site_id=$1
         AND assignment.tenant_id=app_context.current_tenant_id()`,
      [siteId],
    );
  const draft = await client.query<ContentDraft>(
      `SELECT id,site_id AS "siteId",schema_key AS "schemaKey",
         schema_version AS "schemaVersion",content,revision,
         based_on_publication_id AS "basedOnPublicationId",
         updated_at AS "updatedAt"
       FROM public.site_content_drafts
       WHERE site_id=$1 AND tenant_id=app_context.current_tenant_id()`,
      [siteId],
    );
  const publications = await client.query<ContentPublication>(
      `${PUBLICATION_SELECT}
       WHERE publication.site_id=$1
         AND publication.tenant_id=app_context.current_tenant_id()
       ORDER BY publication.publication_number DESC`,
      [siteId],
    );
  return {
    ...site.rows[0],
    assignment: assignment.rows[0] ?? null,
    draft: draft.rows[0] ?? null,
    publications: publications.rows,
  };
}

export async function clientContentWorkspace(
  session: AuthSession,
  siteId: string,
): Promise<ClientContentWorkspace | null> {
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) return null;
  return withClientOperation(session, pageId("content-workspace"), (client) =>
    loadClientWorkspace(client, siteId),
  );
}

async function mediaAudit(
  client: PoolClient,
  input: {
    tenantId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    correlationId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `SELECT app_private.media_record_event($1,$2,$3,$4,$5,'succeeded',$6::jsonb)`,
    [
      input.tenantId,
      input.action,
      input.resourceType,
      input.resourceId,
      input.correlationId,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function clientCompatibleTemplates(
  session: AuthSession,
  siteId: string,
): Promise<{ currentTemplateVersionId: string; options: TemplateOption[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) return null;
  return withClientOperation(session, pageId("template-catalog"), async (client) => {
    const context = await client.query<{
      templateVersionId: string;
      schemaKey: string;
      schemaVersion: number;
    }>(
      `SELECT assignment.template_version_id AS "templateVersionId",
         draft.schema_key AS "schemaKey",draft.schema_version AS "schemaVersion"
       FROM public.sites site
       JOIN public.site_content_drafts draft ON draft.site_id=site.id
       JOIN public.site_template_assignments assignment
         ON assignment.site_id=site.id AND assignment.status='active'
       WHERE site.id=$1 AND site.tenant_id=app_context.current_tenant_id()
         AND site.status IN ('preparing','active') AND site.deleted_at IS NULL`,
      [siteId],
    );
    const current = context.rows[0];
    if (!current) return null;
    const result = await client.query<TemplateOption>(
      `SELECT version.id,template.id AS "templateId",
         template.key AS "templateKey",template.display_name AS "displayName",
         template.description,version.version,
         version.renderer_key AS "rendererKey",
         version.content_schema_key AS "schemaKey",
         version.minimum_schema_version AS "minimumSchemaVersion",
         version.maximum_schema_version AS "maximumSchemaVersion",
         version.status,version.preview_key AS "previewKey"
       FROM public.template_versions version
       JOIN public.templates template ON template.id=version.template_id
       WHERE template.industry_key='restaurant' AND template.status='active'
         AND version.status='active'
         AND version.content_schema_key=$1
         AND $2 BETWEEN version.minimum_schema_version
                    AND version.maximum_schema_version
       ORDER BY template.display_name,version.version DESC`,
      [current.schemaKey, current.schemaVersion],
    );
    return {
      currentTemplateVersionId: current.templateVersionId,
      options: result.rows
        .filter((option) =>
          rendererIsCompatible(
            option.rendererKey,
            current.schemaKey,
            current.schemaVersion,
          ),
        )
        .sort(templateCatalogOrder),
    };
  });
}

export async function clientPreviewAlternativeTemplate(
  session: AuthSession,
  siteId: string,
  templateVersionId: string,
): Promise<{
  option: TemplateOption;
  draft: ContentDraft;
  media: Awaited<ReturnType<typeof mediaManifestForOwner>>;
} | null> {
  if (
    !/^[0-9a-f-]{36}$/i.test(siteId) ||
    !/^[0-9a-f-]{36}$/i.test(templateVersionId)
  ) return null;
  return withClientOperation(session, pageId("template-preview"), async (client) => {
    const catalog = await clientCompatibleTemplatesInTransaction(client, siteId);
    const option = catalog?.options.find((item) => item.id === templateVersionId);
    if (!catalog || !option) return null;
    const draft = await client.query<ContentDraft>(
      `SELECT id,site_id AS "siteId",schema_key AS "schemaKey",
         schema_version AS "schemaVersion",content,revision,
         based_on_publication_id AS "basedOnPublicationId",
         updated_at AS "updatedAt"
       FROM public.site_content_drafts WHERE site_id=$1
         AND tenant_id=app_context.current_tenant_id()`,
      [siteId],
    );
    if (!draft.rows[0]) return null;
    validateContentForSchema(
      draft.rows[0].schemaKey,
      draft.rows[0].schemaVersion,
      draft.rows[0].content,
      "draft",
    );
    const media = await mediaManifestForOwner(
      client,
      { draftId: draft.rows[0].id },
      "private",
    );
    await mediaAudit(client, {
      tenantId: session.activeTenantId!,
      action: "template_previewed",
      resourceType: "template_assignment",
      resourceId: siteId,
      correlationId: pageId("template-preview-audit"),
      metadata: { template_version_id: option.id },
    });
    return { option, draft: draft.rows[0], media };
  });
}

export async function adminPreviewAlternativeTemplate(
  session: AuthSession,
  siteId: string,
  templateVersionId: string,
): Promise<{
  option: TemplateOption;
  draft: ContentDraft;
  media: Awaited<ReturnType<typeof mediaManifestForOwner>>;
} | null> {
  if (
    !/^[0-9a-f-]{36}$/i.test(siteId) ||
    !/^[0-9a-f-]{36}$/i.test(templateVersionId)
  ) return null;
  return withAdminOperation(session, pageId("admin-template-preview"), async (client) => {
    const context = await client.query<{
      tenantId: string;
      draft: ContentDraft;
    }>(
      `SELECT site.tenant_id AS "tenantId",
         jsonb_build_object(
           'id',draft.id,
           'siteId',draft.site_id,
           'schemaKey',draft.schema_key,
           'schemaVersion',draft.schema_version,
           'content',draft.content,
           'revision',draft.revision,
           'basedOnPublicationId',draft.based_on_publication_id,
           'updatedAt',draft.updated_at
         ) AS draft
       FROM public.sites site
       JOIN public.site_content_drafts draft ON draft.site_id=site.id
       WHERE site.id=$1
         AND site.status IN ('preparing','active','suspended')
         AND site.deleted_at IS NULL`,
      [siteId],
    );
    const current = context.rows[0];
    if (!current) return null;
    const option = await client.query<TemplateOption>(
      `SELECT version.id,template.id AS "templateId",
         template.key AS "templateKey",template.display_name AS "displayName",
         template.description,version.version,
         version.renderer_key AS "rendererKey",
         version.content_schema_key AS "schemaKey",
         version.minimum_schema_version AS "minimumSchemaVersion",
         version.maximum_schema_version AS "maximumSchemaVersion",
         version.status,version.preview_key AS "previewKey"
       FROM public.template_versions version
       JOIN public.templates template ON template.id=version.template_id
       WHERE version.id=$1
         AND template.industry_key='restaurant'
         AND template.status='active'
         AND version.status='active'
         AND version.content_schema_key=$2
         AND $3 BETWEEN version.minimum_schema_version
                    AND version.maximum_schema_version`,
      [templateVersionId, current.draft.schemaKey, current.draft.schemaVersion],
    );
    const selected = option.rows[0];
    if (!selected || !rendererIsCompatible(
      selected.rendererKey,
      current.draft.schemaKey,
      current.draft.schemaVersion,
    )) {
      return null;
    }
    validateContentForSchema(
      current.draft.schemaKey,
      current.draft.schemaVersion,
      current.draft.content,
      "draft",
    );
    const media = await mediaManifestForOwner(
      client,
      { draftId: current.draft.id },
      "private",
    );
    await mediaAudit(client, {
      tenantId: current.tenantId,
      action: "template_previewed",
      resourceType: "template_assignment",
      resourceId: siteId,
      correlationId: pageId("admin-template-preview-audit"),
      metadata: { template_version_id: selected.id, audience: "nexi_admin" },
    });
    return { option: selected, draft: current.draft, media };
  });
}

async function clientCompatibleTemplatesInTransaction(
  client: PoolClient,
  siteId: string,
): Promise<{ currentTemplateVersionId: string; options: TemplateOption[] } | null> {
  const current = await client.query<{
    templateVersionId: string;
    schemaKey: string;
    schemaVersion: number;
  }>(
    `SELECT assignment.template_version_id AS "templateVersionId",
       draft.schema_key AS "schemaKey",draft.schema_version AS "schemaVersion"
     FROM public.sites site
     JOIN public.site_content_drafts draft ON draft.site_id=site.id
     JOIN public.site_template_assignments assignment
       ON assignment.site_id=site.id AND assignment.status='active'
     WHERE site.id=$1 AND site.tenant_id=app_context.current_tenant_id()
       AND site.status IN ('preparing','active') AND site.deleted_at IS NULL`,
    [siteId],
  );
  if (!current.rows[0]) return null;
  const options = await client.query<TemplateOption>(
    `SELECT version.id,template.id AS "templateId",
       template.key AS "templateKey",template.display_name AS "displayName",
       template.description,version.version,
       version.renderer_key AS "rendererKey",
       version.content_schema_key AS "schemaKey",
       version.minimum_schema_version AS "minimumSchemaVersion",
       version.maximum_schema_version AS "maximumSchemaVersion",
       version.status,version.preview_key AS "previewKey"
     FROM public.template_versions version
     JOIN public.templates template ON template.id=version.template_id
     WHERE template.industry_key='restaurant' AND template.status='active'
       AND version.status='active' AND version.content_schema_key=$1
       AND $2 BETWEEN version.minimum_schema_version
                  AND version.maximum_schema_version`,
    [current.rows[0].schemaKey, current.rows[0].schemaVersion],
  );
  return {
    currentTemplateVersionId: current.rows[0].templateVersionId,
    options: options.rows
      .filter((option) =>
        rendererIsCompatible(
          option.rendererKey,
          current.rows[0].schemaKey,
          current.rows[0].schemaVersion,
        ),
      )
      .sort(templateCatalogOrder),
  };
}

export async function clientChangeTemplate(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const siteId = uuid(form.get("site_id"));
  const templateVersionId = uuid(form.get("template_version_id"));
  const idempotencyKey = uuid(form.get("idempotency_key"));
  const expectedVersion = integer(form.get("assignment_version"));
  return withClientOperation(session, correlationId, async (client) => {
    const catalog = await clientCompatibleTemplatesInTransaction(client, siteId);
    const option = catalog?.options.find((item) => item.id === templateVersionId);
    if (!catalog || !option) throw new OperationValidationError("not_found");
    if (!templateSelectionIsAllowed(option)) {
      throw new OperationValidationError("denied");
    }
    const current = await client.query<{
      id: string;
      version: number;
      idempotencyKey: string;
    }>(
      `SELECT id,version,idempotency_key AS "idempotencyKey"
       FROM public.site_template_assignments
       WHERE site_id=$1 AND tenant_id=app_context.current_tenant_id()
       FOR UPDATE`,
      [siteId],
    );
    if (!current.rows[0]) throw new OperationValidationError("not_found");
    if (current.rows[0].idempotencyKey === idempotencyKey) return siteId;
    if (current.rows[0].version !== expectedVersion) {
      throw new OperationValidationError("conflict");
    }
    const updated = await client.query(
      `UPDATE public.site_template_assignments SET
         template_version_id=$2,idempotency_key=$3,
         assigned_by_user_id=$4,version=version+1
       WHERE id=$1 AND version=$5 RETURNING id`,
      [
        current.rows[0].id,
        option.id,
        idempotencyKey,
        session.userId,
        expectedVersion,
      ],
    );
    if (!updated.rows[0]) throw new OperationValidationError("conflict");
    await mediaAudit(client, {
      tenantId: session.activeTenantId!,
      action: "template_changed",
      resourceType: "template_assignment",
      resourceId: current.rows[0].id,
      correlationId,
      metadata: { template_version_id: option.id },
    });
    return siteId;
  });
}

export async function migrateClientDraftToRestaurantV2(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const siteId = uuid(form.get("site_id"));
  const expectedRevision = integer(form.get("revision"));
  const idempotencyKey = uuid(form.get("idempotency_key"));
  return withClientOperation(session, correlationId, async (client) => {
    const draft = await client.query<{
      id: string;
      revision: number;
      schemaKey: string;
      content: RestaurantContent;
      lastIdempotencyKey: string;
      assignmentId: string;
    }>(
      `SELECT draft.id,draft.revision,draft.schema_key AS "schemaKey",
         draft.content,draft.last_idempotency_key AS "lastIdempotencyKey",
         assignment.id AS "assignmentId"
       FROM public.site_content_drafts draft
       JOIN public.sites site ON site.id=draft.site_id
       JOIN public.site_template_assignments assignment
         ON assignment.site_id=draft.site_id AND assignment.status='active'
       WHERE draft.site_id=$1
         AND draft.tenant_id=app_context.current_tenant_id()
         AND site.status IN ('preparing','active')
       FOR UPDATE OF draft,assignment`,
      [siteId],
    );
    const row = draft.rows[0];
    if (!row) throw new OperationValidationError("not_found");
    if (row.schemaKey === RESTAURANT_V2_SCHEMA_KEY) return siteId;
    if (row.lastIdempotencyKey === idempotencyKey) return siteId;
    if (row.revision !== expectedRevision) throw new OperationValidationError("conflict");
    const bundled = await client.query<{ reference: string; assetId: string }>(
      `SELECT bundled_reference AS reference,id AS "assetId"
       FROM public.media_assets
       WHERE site_id=$1 AND tenant_id=app_context.current_tenant_id()
         AND source_kind='bundled' AND status='ready'`,
      [siteId],
    );
    const byReference = Object.fromEntries(
      bundled.rows.map((asset) => [asset.reference, asset.assetId]),
    );
    const migrated = migrateRestaurantV1ToV2(row.content, byReference);
    const target = await client.query<{ id: string }>(
      `SELECT id FROM public.template_versions
       WHERE renderer_key=$1 AND content_schema_key=$2
         AND status='active' LIMIT 1`,
      [RESTAURANT_CLASSIC_V2_RENDERER_KEY, RESTAURANT_V2_SCHEMA_KEY],
    );
    if (!target.rows[0]) throw new OperationValidationError("not_found");
    await client.query(
      `UPDATE public.site_template_assignments SET
         template_version_id=$2,schema_key=$3,schema_version=$4,
         idempotency_key=$5,assigned_by_user_id=$6,version=version+1
       WHERE id=$1`,
      [
        row.assignmentId,
        target.rows[0].id,
        RESTAURANT_V2_SCHEMA_KEY,
        RESTAURANT_V2_SCHEMA_VERSION,
        randomUUID(),
        session.userId,
      ],
    );
    await client.query(
      `UPDATE public.site_content_drafts SET schema_key=$2,schema_version=$3,
         content=$4::jsonb,revision=revision+1,updated_by_user_id=$5,
         last_idempotency_key=$6 WHERE id=$1`,
      [
        row.id,
        RESTAURANT_V2_SCHEMA_KEY,
        RESTAURANT_V2_SCHEMA_VERSION,
        JSON.stringify(migrated),
        session.userId,
        idempotencyKey,
      ],
    );
    await replaceDraftMediaReferences(client, {
      tenantId: session.activeTenantId!,
      siteId,
      draftId: row.id,
      references: contentMediaReferences(RESTAURANT_V2_SCHEMA_KEY, migrated),
    });
    await mediaAudit(client, {
      tenantId: session.activeTenantId!,
      action: "restaurant_v2_migrated",
      resourceType: "content_draft",
      resourceId: row.id,
      correlationId,
      metadata: { from_revision: row.revision, to_schema: RESTAURANT_V2_SCHEMA_KEY },
    });
    return siteId;
  });
}

function changedSections(
  previous: RestaurantAnyContent,
  next: RestaurantAnyContent,
): string[] {
  return Object.keys(next).filter((key) =>
    JSON.stringify(previous[key as keyof RestaurantAnyContent]) !==
    JSON.stringify(next[key as keyof RestaurantAnyContent]),
  );
}

async function recordClientFailure(
  session: AuthSession,
  correlationId: string,
  siteId: string,
  action: "content_edit_conflict" | "content_publish_rejected",
  reason: string,
): Promise<void> {
  await withClientOperation(session, `${correlationId}-audit`, async (client) => {
    await clientAudit(
      client,
      session,
      correlationId,
      action,
      action === "content_edit_conflict" ? "content_draft" : "content_publication",
      siteId,
      { reason },
    );
  }).catch(() => undefined);
}

export async function saveContentDraft(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const siteId = uuid(form.get("site_id"));
  const expectedRevision = integer(form.get("revision"));
  const idempotencyKey = uuid(form.get("idempotency_key"));
  const serialized = String(form.get("content_json") || "");
  try {
    return await withClientOperation(session, correlationId, async (client) => {
      const current = await client.query<{
        id: string;
        revision: number;
        lastIdempotencyKey: string;
        rendererKey: string;
        schemaKey: string;
        schemaVersion: number;
        content: RestaurantAnyContent;
      }>(
        `SELECT draft.id,draft.revision,
           draft.last_idempotency_key AS "lastIdempotencyKey",
           version.renderer_key AS "rendererKey",
           draft.schema_key AS "schemaKey",draft.schema_version AS "schemaVersion",
           draft.content
         FROM public.site_content_drafts draft
         JOIN public.sites site ON site.id=draft.site_id
         JOIN public.site_template_assignments assignment
           ON assignment.site_id=site.id AND assignment.status='active'
         JOIN public.template_versions version
           ON version.id=assignment.template_version_id
         WHERE draft.site_id=$1
           AND draft.tenant_id=app_context.current_tenant_id()
           AND site.status IN ('preparing','active')
         FOR UPDATE OF draft`,
        [siteId],
      );
      const row = current.rows[0];
      if (!row) throw new OperationValidationError("not_found");
      if (!rendererIsCompatible(row.rendererKey, row.schemaKey, row.schemaVersion)) {
        throw new OperationValidationError("invalid");
      }
      const content = parseContentForSchema(
        row.schemaKey,
        row.schemaVersion,
        serialized,
        "draft",
      );
      if (row.lastIdempotencyKey === idempotencyKey) return siteId;
      if (row.revision !== expectedRevision) {
        throw new OperationValidationError("conflict");
      }
      const updated = await client.query<{ revision: number }>(
        `UPDATE public.site_content_drafts SET
           content=$2::jsonb,revision=revision+1,updated_by_user_id=$3,
           last_idempotency_key=$4
         WHERE id=$1 AND revision=$5 RETURNING revision`,
        [
          row.id,
          JSON.stringify(content),
          session.userId,
          idempotencyKey,
          expectedRevision,
        ],
      );
      if (!updated.rows[0]) throw new OperationValidationError("conflict");
      const referenceChanges = await replaceDraftMediaReferences(client, {
        tenantId: session.activeTenantId!,
        siteId,
        draftId: row.id,
        references: contentMediaReferences(row.schemaKey, content),
      });
      await clientAudit(
        client,
        session,
        correlationId,
        "content_draft_saved",
        "content_draft",
        row.id,
        {
          previous_revision: expectedRevision,
          new_revision: updated.rows[0].revision,
          sections: changedSections(row.content, content),
          media_added: referenceChanges.added,
          media_removed: referenceChanges.removed,
        },
      );
      return siteId;
    });
  } catch (error) {
    if (error instanceof OperationValidationError && error.code === "conflict") {
      await recordClientFailure(session, correlationId, siteId, "content_edit_conflict", "revision");
    }
    throw mapOperationError(error);
  }
}

export async function clientPreviewContent(
  session: AuthSession,
  siteId: string,
): Promise<{
  assignment: TemplateAssignment;
  draft: ContentDraft;
  media: Awaited<ReturnType<typeof mediaManifestForOwner>>;
} | null> {
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) return null;
  return withClientOperation(session, pageId("content-preview"), async (client) => {
    const workspace = await loadClientWorkspace(client, siteId);
    if (!workspace?.assignment || !workspace.draft ||
        !["preparing", "active"].includes(workspace.siteStatus)) {
      await clientAudit(
        client,
        session,
        pageId("content-preview-denied"),
        "content_access_denied",
        "public_site",
        siteId,
      );
      return null;
    }
    if (!rendererIsCompatible(
      workspace.assignment.rendererKey,
      workspace.draft.schemaKey,
      workspace.draft.schemaVersion,
    )) {
      return null;
    }
    validateContentForSchema(
      workspace.draft.schemaKey,
      workspace.draft.schemaVersion,
      workspace.draft.content,
      "draft",
    );
    const media = await mediaManifestForOwner(
      client,
      { draftId: workspace.draft.id },
      "private",
    );
    await clientAudit(
      client,
      session,
      pageId("content-preview-audit"),
      "content_previewed",
      "public_site",
      siteId,
      { revision: workspace.draft.revision },
    );
    return { assignment: workspace.assignment, draft: workspace.draft, media };
  });
}

export interface ContentPublicationTransactionResult {
  siteId: string;
  publicationId?: string;
  publicationNumber?: number;
  draftRevision?: number;
  mediaCount?: number;
  replayed?: boolean;
  rejected: "site" | "revision" | "renderer" | "content" | null;
  field?: string;
}

export async function publishContentTransaction(
  client: PoolClient,
  input: Readonly<{
    tenantId: string;
    actorUserId: string;
    siteId: string;
    expectedRevision: number;
    idempotencyKey: string;
    allowedSiteStatuses?: readonly ("preparing" | "active")[];
  }>,
): Promise<ContentPublicationTransactionResult> {
  const allowedStatuses = input.allowedSiteStatuses ?? ["active"];
  const site = await client.query<{ status: "preparing" | "active" }>(
    `SELECT status FROM public.sites WHERE id=$1 AND tenant_id=$2
       AND status=ANY($3::text[]) AND deleted_at IS NULL FOR UPDATE`,
    [input.siteId, input.tenantId, allowedStatuses],
  );
  if (!site.rows[0]) return { siteId: input.siteId, rejected: "site" };
  if (site.rows[0].status === "preparing") {
    await client.query(
      `UPDATE public.sites SET status='active',version=version+1
       WHERE id=$1 AND tenant_id=$2 AND status='preparing'`,
      [input.siteId, input.tenantId],
    );
  }
  const replay = await client.query<{
    siteId: string;
    publicationId: string;
    publicationNumber: number;
  }>(
    `SELECT site_id AS "siteId",id AS "publicationId",
       publication_number AS "publicationNumber"
     FROM public.site_content_publications
     WHERE tenant_id=$1 AND published_by_user_id=$2 AND idempotency_key=$3`,
    [input.tenantId, input.actorUserId, input.idempotencyKey],
  );
  if (replay.rows[0]) {
    return { ...replay.rows[0], rejected: null, replayed: true };
  }
  const draft = await client.query<{
    id: string;
    revision: number;
    schemaKey: string;
    schemaVersion: number;
    content: RestaurantAnyContent;
    templateVersionId: string;
    rendererKey: string;
  }>(
    `SELECT draft.id,draft.revision,draft.schema_key AS "schemaKey",
       draft.schema_version AS "schemaVersion",draft.content,
       assignment.template_version_id AS "templateVersionId",
       version.renderer_key AS "rendererKey"
     FROM public.site_content_drafts draft
     JOIN public.site_template_assignments assignment
       ON assignment.site_id=draft.site_id AND assignment.status='active'
     JOIN public.template_versions version
       ON version.id=assignment.template_version_id
      AND version.status IN ('active','deprecated')
     WHERE draft.site_id=$1 AND draft.tenant_id=$2
     FOR UPDATE OF draft`,
    [input.siteId, input.tenantId],
  );
  const row = draft.rows[0];
  if (!row || row.revision !== input.expectedRevision) {
    return { siteId: input.siteId, rejected: "revision" };
  }
  if (
    !rendererIsCompatible(row.rendererKey, row.schemaKey, row.schemaVersion) ||
    !rendererPublicationIsAllowed(row.rendererKey)
  ) {
    return { siteId: input.siteId, rejected: "renderer" };
  }
  let content: RestaurantAnyContent;
  try {
    content = validateContentForSchema(
      row.schemaKey,
      row.schemaVersion,
      row.content,
      "publication",
    );
  } catch (error) {
    if (error instanceof RestaurantContentValidationError) {
      return {
        siteId: input.siteId,
        rejected: "content",
        field: error.field,
      };
    }
    throw error;
  }
  const next = await client.query<{ number: number }>(
    `SELECT COALESCE(max(publication_number),0)+1 AS number
     FROM public.site_content_publications WHERE site_id=$1`,
    [input.siteId],
  );
  const publication = await client.query<{ id: string }>(
    `INSERT INTO public.site_content_publications(
       tenant_id,site_id,template_version_id,schema_key,schema_version,
       content_snapshot,publication_number,published_by_user_id,idempotency_key
     ) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) RETURNING id`,
    [
      input.tenantId,
      input.siteId,
      row.templateVersionId,
      row.schemaKey,
      row.schemaVersion,
      JSON.stringify(content),
      next.rows[0].number,
      input.actorUserId,
      input.idempotencyKey,
    ],
  );
  const mediaCount = await copyDraftMediaToPublication(client, {
    tenantId: input.tenantId,
    siteId: input.siteId,
    draftId: row.id,
    publicationId: publication.rows[0].id,
  });
  await client.query(
    `UPDATE public.sites SET current_publication_id=$2,status='active',
       version=version+1 WHERE id=$1 AND tenant_id=$3`,
    [input.siteId, publication.rows[0].id, input.tenantId],
  );
  return {
    siteId: input.siteId,
    publicationId: publication.rows[0].id,
    publicationNumber: next.rows[0].number,
    draftRevision: row.revision,
    mediaCount,
    rejected: null,
  };
}

export async function publishContent(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const siteId = uuid(form.get("site_id"));
  const expectedRevision = integer(form.get("revision"));
  const idempotencyKey = uuid(form.get("idempotency_key"));
  try {
    const result = await withClientOperation(session, correlationId, async (client) => {
      const publication = await publishContentTransaction(client, {
        tenantId: session.activeTenantId!,
        actorUserId: session.userId,
        siteId,
        expectedRevision,
        idempotencyKey,
      });
      if (!publication.rejected && !publication.replayed && publication.publicationId) {
        await clientAudit(
          client,
          session,
          correlationId,
          "content_published",
          "content_publication",
          publication.publicationId,
          {
            publication_number: publication.publicationNumber,
            draft_revision: publication.draftRevision,
            media_count: publication.mediaCount,
          },
        );
      }
      return publication;
    });
    if (result.rejected) {
      await recordClientFailure(
        session,
        correlationId,
        siteId,
        "content_publish_rejected",
        result.rejected,
      );
      throw new OperationValidationError(
        result.rejected === "revision" ? "conflict" : "invalid",
        "field" in result && result.field ? { field: result.field } : undefined,
      );
    }
    return result.siteId;
  } catch (error) {
    throw mapOperationError(error);
  }
}

export async function restorePublication(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const siteId = uuid(form.get("site_id"));
  const sourcePublicationId = uuid(form.get("publication_id"));
  const idempotencyKey = uuid(form.get("idempotency_key"));
  try {
    const result = await withClientOperation(session, correlationId, async (client) => {
      const site = await client.query(
        `SELECT 1 FROM public.sites WHERE id=$1
           AND tenant_id=app_context.current_tenant_id()
           AND status='active' AND deleted_at IS NULL FOR UPDATE`,
        [siteId],
      );
      if (!site.rowCount) return { rejected: "site" as const };
      const replay = await client.query<{ siteId: string }>(
        `SELECT site_id AS "siteId" FROM public.site_content_publications
         WHERE tenant_id=app_context.current_tenant_id()
           AND published_by_user_id=app_context.current_user_id()
           AND idempotency_key=$1`,
        [idempotencyKey],
      );
      if (replay.rows[0]) return { siteId: replay.rows[0].siteId, rejected: null };
      const source = await client.query<{
        templateVersionId: string;
        schemaKey: string;
        schemaVersion: number;
        content: RestaurantAnyContent;
        rendererKey: string;
      }>(
        `SELECT publication.template_version_id AS "templateVersionId",
           publication.schema_key AS "schemaKey",
           publication.schema_version AS "schemaVersion",
           publication.content_snapshot AS content,
           version.renderer_key AS "rendererKey"
         FROM public.site_content_publications publication
         JOIN public.template_versions version
           ON version.id=publication.template_version_id
         WHERE publication.id=$1 AND publication.site_id=$2
           AND publication.tenant_id=app_context.current_tenant_id()`,
        [sourcePublicationId, siteId],
      );
      const row = source.rows[0];
      if (
        !row ||
        !rendererIsCompatible(
          row.rendererKey,
          row.schemaKey,
          row.schemaVersion,
        ) ||
        !rendererPublicationIsAllowed(row.rendererKey)
      ) return { rejected: "source" as const };
      const content = validateContentForSchema(
        row.schemaKey,
        row.schemaVersion,
        row.content,
        "publication",
      );
      const draft = await client.query<{ id: string; revision: number }>(
        `SELECT id,revision FROM public.site_content_drafts
         WHERE site_id=$1 AND tenant_id=app_context.current_tenant_id()
         FOR UPDATE`,
        [siteId],
      );
      if (!draft.rows[0]) return { rejected: "draft" as const };
      await client.query(
        `UPDATE public.site_template_assignments SET
           template_version_id=$2,schema_key=$3,schema_version=$4,
           idempotency_key=$5,assigned_by_user_id=$6,
           version=version+1,status='active'
         WHERE site_id=$1`,
        [
          siteId,
          row.templateVersionId,
          row.schemaKey,
          row.schemaVersion,
          randomUUID(),
          session.userId,
        ],
      );
      await client.query(
        `UPDATE public.site_content_drafts SET schema_key=$2,schema_version=$3,
           content=$4::jsonb,revision=revision+1,based_on_publication_id=$5,
           updated_by_user_id=$6,last_idempotency_key=$7
         WHERE id=$1`,
        [
          draft.rows[0].id,
          row.schemaKey,
          row.schemaVersion,
          JSON.stringify(content),
          sourcePublicationId,
          session.userId,
          randomUUID(),
        ],
      );
      const next = await client.query<{ number: number }>(
        `SELECT COALESCE(max(publication_number),0)+1 AS number
         FROM public.site_content_publications WHERE site_id=$1`,
        [siteId],
      );
      const publication = await client.query<{ id: string }>(
        `INSERT INTO public.site_content_publications(
           tenant_id,site_id,template_version_id,schema_key,schema_version,
           content_snapshot,publication_number,published_by_user_id,
           idempotency_key,restored_from_publication_id
         ) VALUES(
           app_context.current_tenant_id(),$1,$2,$3,$4,$5::jsonb,$6,
           app_context.current_user_id(),$7,$8
         ) RETURNING id`,
        [
          siteId,
          row.templateVersionId,
          row.schemaKey,
          row.schemaVersion,
          JSON.stringify(content),
          next.rows[0].number,
          idempotencyKey,
          sourcePublicationId,
        ],
      );
      const mediaCount = await copyPublicationMediaReferences(client, {
        tenantId: session.activeTenantId!,
        siteId,
        sourcePublicationId,
        targetPublicationId: publication.rows[0].id,
        draftId: draft.rows[0].id,
      });
      await client.query(
        `UPDATE public.sites SET current_publication_id=$2,version=version+1
         WHERE id=$1 AND tenant_id=app_context.current_tenant_id()`,
        [siteId, publication.rows[0].id],
      );
      await clientAudit(
        client,
        session,
        correlationId,
        "content_restored",
        "content_publication",
        publication.rows[0].id,
        {
          publication_number: next.rows[0].number,
          restored_from: sourcePublicationId,
          media_count: mediaCount,
        },
      );
      return { siteId, rejected: null };
    });
    if (result.rejected) throw new OperationValidationError("invalid");
    return result.siteId;
  } catch (error) {
    throw mapOperationError(error);
  }
}

export async function resolvePublicSite(input: {
  hostname?: string | null;
  siteSlug?: string | null;
}): Promise<PublicSiteResolution | null> {
  const config = getAppConfig();
  const normalizedHost = input.hostname ? normalizeHostname(input.hostname) : null;
  const normalizedSlug = input.siteSlug?.trim().toLowerCase() || null;
  if (input.hostname && !normalizedHost) return null;
  if (normalizedSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
    return null;
  }
  if (normalizedSlug && !["local", "test"].includes(config.environment)) {
    return null;
  }
  return withApplicationDatabase(async (pool) => {
    const result = await pool.query<PublicSiteResolution>(
      `SELECT site_id AS "siteId",site_slug AS "siteSlug",
         public_state AS "publicState",canonical_hostname AS "canonicalHostname",
         renderer_key AS "rendererKey",schema_key AS "schemaKey",
         schema_version AS "schemaVersion",publication_id AS "publicationId",
         publication_number AS "publicationNumber",content_snapshot AS content
       FROM app_private.resolve_public_site($1,$2)`,
      [normalizedHost, normalizedHost ? null : normalizedSlug],
    );
    const row = result.rows[0] ?? null;
    if (row?.publicState === "published" && row.content) {
      try {
        validateContentForSchema(
          row.schemaKey ?? "",
          row.schemaVersion ?? 0,
          row.content,
          "publication",
        );
        if (!row.rendererKey || !row.schemaKey || !row.schemaVersion ||
            !rendererIsCompatible(row.rendererKey, row.schemaKey, row.schemaVersion)) {
          throw new Error("renderer");
        }
      } catch (error) {
        const reason = error instanceof RestaurantContentValidationError
          ? "content"
          : "renderer";
        await pool.query(
          `SELECT app_private.content_record_public_event($1,$2,$3,$4)`,
          [
            row.siteId,
            reason === "renderer" ? "renderer_unknown" : "public_resolution_failed",
            pageId("public-resolution"),
            reason,
          ],
        ).catch(() => undefined);
        createLogger({
          environment: config.environment,
          service: config.serviceName,
          minimumLevel: config.logLevel,
        }).error("public_site_resolution_failed", {
          site_id: row.siteId,
          reason,
        });
        return { ...row, publicState: "unavailable", content: null };
      }
    }
    if (row?.publicState === "published" && row.publicationId) {
      const media = await mediaManifestForOwner(
        pool,
        { publicationId: row.publicationId },
        "public",
      );
      return { ...row, media };
    }
    return row;
  });
}
