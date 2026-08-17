import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AuthSession } from "@/src/auth/types";
import { withApplicationDatabase } from "@/src/db/application-database.server";
import { withAdminOperation, withClientOperation } from "@/src/operations/contexts.server";
import {
  mapOperationError,
  OperationValidationError,
  UUID,
} from "@/src/operations/validation";
import { processLocalMedia, readLocalMedia } from "./local-client.server";
import type {
  MediaAllowedMimeType,
  MediaAssetRecord,
  MediaAssetStatus,
  MediaLibraryPage,
  MediaQuota,
  MediaRenderManifest,
  MediaVariantName,
} from "./types";

const ALLOWED = new Set<MediaAllowedMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const STATUSES = new Set<MediaAssetStatus>([
  "processing",
  "ready",
  "rejected",
  "failed",
  "archived",
]);

export class MediaOperationError extends OperationValidationError {
  constructor(
    readonly mediaCode:
      | "format"
      | "size"
      | "quota"
      | "processing"
      | "in_use"
      | "unavailable",
    field?: string,
  ) {
    super(mediaCode === "quota" ? "plan" : "invalid", { field });
    this.name = "MediaOperationError";
  }
}

function cleanName(value: string, fallback: string): string {
  const result = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return result || fallback;
}

function requireUuid(value: string): string {
  if (!UUID.test(value)) throw new OperationValidationError("invalid");
  return value.toLowerCase();
}

function correlation(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

async function audit(
  client: PoolClient,
  input: {
    tenantId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    correlationId: string;
    outcome?: "succeeded" | "failed" | "blocked";
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `SELECT app_private.media_record_event($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      input.tenantId,
      input.action,
      input.resourceType,
      input.resourceId,
      input.correlationId,
      input.outcome ?? "succeeded",
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

async function withMediaContext<T>(
  session: AuthSession,
  correlationId: string,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return session.audience === "nexi_admin"
    ? withAdminOperation(session, correlationId, operation)
    : withClientOperation(session, correlationId, operation);
}

async function siteForWrite(
  client: PoolClient,
  session: AuthSession,
  siteId: string,
): Promise<{ tenantId: string; siteName: string }> {
  const result = await client.query<{ tenantId: string; siteName: string }>(
    `SELECT site.tenant_id AS "tenantId",site.display_name AS "siteName"
     FROM public.sites site
     JOIN public.tenants tenant ON tenant.id=site.tenant_id
     WHERE site.id=$1 AND site.status IN ('preparing','active')
       AND site.deleted_at IS NULL
       AND tenant.status='active' AND tenant.deleted_at IS NULL
       AND ($2::boolean OR site.tenant_id=app_context.current_tenant_id())
     FOR UPDATE OF site`,
    [siteId, session.audience === "nexi_admin"],
  );
  if (!result.rows[0]) throw new OperationValidationError("not_found");
  return result.rows[0];
}

async function quotaForSite(
  client: PoolClient,
  tenantId: string,
  siteId: string,
  lock: boolean,
): Promise<MediaQuota> {
  if (lock) {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1::text||':'||$2::text,0))`,
      [tenantId, siteId],
    );
  }
  const assignment = await client.query<{
    enabled: boolean;
    assetLimit: number;
    storageBytes: string;
    uploadMaxBytes: string;
    allowedMimeTypes: MediaAllowedMimeType[];
  }>(
    `SELECT capability.media_library_enabled AS enabled,
       capability.media_asset_limit AS "assetLimit",
       capability.media_storage_bytes AS "storageBytes",
       capability.media_upload_max_bytes AS "uploadMaxBytes",
       capability.media_allowed_mime_types AS "allowedMimeTypes"
     FROM public.tenant_plan_assignments assignment
     JOIN public.plan_media_capabilities capability
       ON capability.plan_id=assignment.plan_id
     WHERE assignment.tenant_id=$1 AND assignment.status='active'`,
    [tenantId],
  );
  const row = assignment.rows[0];
  if (!row) throw new MediaOperationError("unavailable");
  const used = await client.query<{ usedAssets: string; usedBytes: string }>(
    `SELECT count(*) FILTER (
       WHERE status IN ('processing','ready','archived')
     )::text AS "usedAssets",
     COALESCE(sum(byte_size) FILTER (
       WHERE status IN ('processing','ready','archived')
     ),0)::text AS "usedBytes"
     FROM public.media_assets
     WHERE tenant_id=$1 AND site_id=$2`,
    [tenantId, siteId],
  );
  return {
    enabled: row.enabled,
    assetLimit: row.assetLimit,
    storageBytes: Number(row.storageBytes),
    uploadMaxBytes: Number(row.uploadMaxBytes),
    allowedMimeTypes: row.allowedMimeTypes,
    usedAssets: Number(used.rows[0].usedAssets),
    usedBytes: Number(used.rows[0].usedBytes),
  };
}

async function reserveUpload(
  session: AuthSession,
  input: {
    siteId: string;
    idempotencyKey: string;
    filename: string;
    displayName: string;
    declaredMimeType: string;
    byteSize: number;
    correlationId: string;
  },
): Promise<{ assetId: string; tenantId: string; replay: boolean }> {
  return withMediaContext(session, input.correlationId, async (client) => {
    const site = await siteForWrite(client, session, input.siteId);
    const existing = await client.query<{ id: string; status: MediaAssetStatus }>(
      `SELECT id,status FROM public.media_assets
       WHERE tenant_id=$1 AND site_id=$2 AND uploaded_by_user_id=$3
         AND upload_idempotency_key=$4`,
      [site.tenantId, input.siteId, session.userId, input.idempotencyKey],
    );
    if (existing.rows[0]) {
      return {
        assetId: existing.rows[0].id,
        tenantId: site.tenantId,
        replay: true,
      };
    }
    if (!ALLOWED.has(input.declaredMimeType as MediaAllowedMimeType)) {
      await audit(client, {
        tenantId: site.tenantId,
        action: "media_format_rejected",
        resourceType: "media_quota",
        resourceId: input.siteId,
        correlationId: input.correlationId,
        outcome: "blocked",
        metadata: { reason: "declared_type" },
      });
      throw new MediaOperationError("format");
    }
    const quota = await quotaForSite(client, site.tenantId, input.siteId, true);
    const allowedMime = quota.allowedMimeTypes.includes(
      input.declaredMimeType as MediaAllowedMimeType,
    );
    if (
      !quota.enabled ||
      !allowedMime ||
      input.byteSize < 1 ||
      input.byteSize > quota.uploadMaxBytes ||
      quota.usedAssets + 1 > quota.assetLimit ||
      quota.usedBytes + input.byteSize > quota.storageBytes
    ) {
      await audit(client, {
        tenantId: site.tenantId,
        action: "media_quota_exceeded",
        resourceType: "media_quota",
        resourceId: input.siteId,
        correlationId: input.correlationId,
        outcome: "blocked",
        metadata: {
          reason: !quota.enabled
            ? "disabled"
            : !allowedMime
              ? "format"
              : input.byteSize > quota.uploadMaxBytes
                ? "upload_size"
                : quota.usedAssets + 1 > quota.assetLimit
                  ? "asset_count"
                  : "storage",
        },
      });
      throw new MediaOperationError(
        input.byteSize > quota.uploadMaxBytes ? "size" : "quota",
      );
    }
    const assetId = randomUUID();
    await client.query(
      `INSERT INTO public.media_assets(
         id,tenant_id,site_id,source_kind,storage_provider,original_filename,
         display_name,detected_mime_type,byte_size,status,uploaded_by_user_id,
         upload_idempotency_key
       ) VALUES($1,$2,$3,'uploaded','local',$4,$5,$6,$7,'processing',$8,$9)`,
      [
        assetId,
        site.tenantId,
        input.siteId,
        input.filename,
        input.displayName,
        input.declaredMimeType,
        input.byteSize,
        session.userId,
        input.idempotencyKey,
      ],
    );
    await audit(client, {
      tenantId: site.tenantId,
      action: "media_upload_started",
      resourceType: "media_asset",
      resourceId: assetId,
      correlationId: input.correlationId,
      metadata: { byte_size: input.byteSize },
    });
    await audit(client, {
      tenantId: site.tenantId,
      action: "media_processing_started",
      resourceType: "media_asset",
      resourceId: assetId,
      correlationId: input.correlationId,
    });
    return { assetId, tenantId: site.tenantId, replay: false };
  });
}

export async function uploadMedia(
  session: AuthSession,
  input: {
    siteId: string;
    idempotencyKey: string;
    filename: string;
    displayName?: string;
    declaredMimeType: string;
    bytes: Uint8Array;
    correlationId: string;
  },
): Promise<string> {
  const siteId = requireUuid(input.siteId);
  const idempotencyKey = requireUuid(input.idempotencyKey);
  const filename = cleanName(input.filename, "imagen");
  const displayName = cleanName(input.displayName ?? filename, "Imagen");
  const reserved = await reserveUpload(session, {
    siteId,
    idempotencyKey,
    filename,
    displayName,
    declaredMimeType: input.declaredMimeType.toLowerCase(),
    byteSize: input.bytes.byteLength,
    correlationId: input.correlationId,
  });
  if (reserved.replay) return reserved.assetId;
  try {
    const processed = await processLocalMedia({
      tenantId: reserved.tenantId,
      siteId,
      assetId: reserved.assetId,
      filename,
      declaredMimeType: input.declaredMimeType.toLowerCase(),
      bytes: input.bytes,
    });
    await withMediaContext(session, input.correlationId, async (client) => {
      const current = await client.query<{ status: string }>(
        `SELECT status FROM public.media_assets
         WHERE id=$1 AND tenant_id=$2 AND site_id=$3 FOR UPDATE`,
        [reserved.assetId, reserved.tenantId, siteId],
      );
      if (current.rows[0]?.status !== "processing") {
        throw new OperationValidationError("conflict");
      }
      await client.query(
        `UPDATE public.media_assets SET storage_key=$2,
           detected_mime_type=$3,normalized_mime_type='image/webp',
           byte_size=$4,width=$5::integer,height=$6::integer,
           pixel_count=$5::bigint*$6::bigint,
           checksum_sha256=$7,status='ready',version=version+1
         WHERE id=$1`,
        [
          reserved.assetId,
          processed.original.storageKey,
          processed.detectedMimeType,
          processed.original.byteSize,
          processed.original.width,
          processed.original.height,
          processed.original.checksum,
        ],
      );
      for (const [name, variant] of Object.entries(processed.variants)) {
        await client.query(
          `INSERT INTO public.media_variants(
             tenant_id,site_id,asset_id,variant_name,storage_provider,storage_key,
             mime_type,byte_size,width,height,checksum_sha256,status
           ) VALUES($1,$2,$3,$4,'local',$5,$6,$7,$8,$9,$10,'ready')`,
          [
            reserved.tenantId,
            siteId,
            reserved.assetId,
            name,
            variant.storageKey,
            variant.mimeType,
            variant.byteSize,
            variant.width,
            variant.height,
            variant.checksum,
          ],
        );
      }
      await audit(client, {
        tenantId: reserved.tenantId,
        action: "media_processing_completed",
        resourceType: "media_asset",
        resourceId: reserved.assetId,
        correlationId: input.correlationId,
        metadata: {
          detected_type: processed.detectedMimeType,
          width: processed.original.width,
          height: processed.original.height,
          variants: Object.keys(processed.variants),
        },
      });
      await audit(client, {
        tenantId: reserved.tenantId,
        action: "media_upload_completed",
        resourceType: "media_asset",
        resourceId: reserved.assetId,
        correlationId: input.correlationId,
      });
    });
    return reserved.assetId;
  } catch (error) {
    const code = String((error as { code?: string })?.code || "processing_failed")
      .replace(/[^a-z0-9_]/g, "_")
      .slice(0, 80);
    await withMediaContext(session, `${input.correlationId}-failed`, async (client) => {
      await client.query(
        `UPDATE public.media_assets SET status=$2,rejection_code=$3,
           version=version+1 WHERE id=$1 AND status='processing'`,
        [
          reserved.assetId,
          code.includes("format") || code.includes("mime") ||
          code.includes("svg") || code.includes("gif")
            ? "rejected"
            : "failed",
          code,
        ],
      );
      await audit(client, {
        tenantId: reserved.tenantId,
        action: code.includes("format") || code.includes("mime")
          ? "media_asset_rejected"
          : "media_processing_failed",
        resourceType: "media_asset",
        resourceId: reserved.assetId,
        correlationId: input.correlationId,
        outcome: "failed",
        metadata: { reason: code },
      });
    }).catch(() => undefined);
    throw new MediaOperationError("processing");
  }
}

export async function listMediaLibrary(
  session: AuthSession,
  input: {
    siteId: string;
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
  },
): Promise<MediaLibraryPage | null> {
  if (!UUID.test(input.siteId)) return null;
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(48, Math.max(1, Math.trunc(input.pageSize ?? 24)));
  const search = (input.search ?? "").trim().slice(0, 120);
  const status = STATUSES.has(input.status as MediaAssetStatus)
    ? input.status as MediaAssetStatus
    : "all";
  return withMediaContext(session, correlation("media-list"), async (client) => {
    const site = await siteForWrite(client, session, input.siteId);
    const quota = await quotaForSite(client, site.tenantId, input.siteId, false);
    const params: unknown[] = [site.tenantId, input.siteId, search];
    let statusSql = "";
    if (status !== "all") {
      params.push(status);
      statusSql = `AND asset.status=$${params.length}`;
    }
    const total = await client.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM public.media_assets asset
       WHERE asset.tenant_id=$1 AND asset.site_id=$2
         AND ($3='' OR lower(asset.display_name) LIKE '%'||lower($3)||'%')
         ${statusSql}`,
      params,
    );
    params.push(pageSize, (page - 1) * pageSize);
    const result = await client.query<MediaAssetRecord>(
      `SELECT asset.id,asset.site_id AS "siteId",
         asset.source_kind AS "sourceKind",
         asset.original_filename AS "originalFilename",
         asset.display_name AS "displayName",
         asset.default_alt_text AS "defaultAltText",
         asset.detected_mime_type AS "detectedMimeType",
         asset.byte_size::int AS "byteSize",asset.width,asset.height,
         asset.checksum_sha256 AS checksum,asset.status,
         asset.rejection_code AS "rejectionCode",asset.version,
         asset.created_at AS "createdAt",
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'name',variant.variant_name,'checksum',variant.checksum_sha256,
             'width',variant.width,'height',variant.height,
             'byteSize',variant.byte_size,'mimeType',variant.mime_type
           ) ORDER BY variant.variant_name)
           FROM public.media_variants variant WHERE variant.asset_id=asset.id
         ),'[]'::jsonb) AS variants,
         (SELECT count(*)::int FROM public.content_media_references reference
          WHERE reference.asset_id=asset.id) AS "referenceCount"
       FROM public.media_assets asset
       WHERE asset.tenant_id=$1 AND asset.site_id=$2
         AND ($3='' OR lower(asset.display_name) LIKE '%'||lower($3)||'%')
         ${statusSql}
       ORDER BY asset.created_at DESC,asset.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      siteId: input.siteId,
      siteName: site.siteName,
      assets: result.rows,
      quota,
      page,
      pageSize,
      total: Number(total.rows[0].total),
      search,
      status,
    };
  });
}

export async function updateMediaMetadata(
  session: AuthSession,
  form: FormData,
  correlationId: string,
): Promise<string> {
  const siteId = requireUuid(String(form.get("site_id") || ""));
  const assetId = requireUuid(String(form.get("asset_id") || ""));
  const version = Number(form.get("version"));
  const displayName = cleanName(String(form.get("display_name") || ""), "Imagen");
  const alt = cleanName(String(form.get("default_alt_text") || ""), "").slice(0, 250);
  return withMediaContext(session, correlationId, async (client) => {
    const site = await siteForWrite(client, session, siteId);
    const updated = await client.query(
      `UPDATE public.media_assets SET display_name=$4,default_alt_text=$5,
         version=version+1
       WHERE id=$1 AND tenant_id=$2 AND site_id=$3 AND version=$6
       RETURNING id`,
      [assetId, site.tenantId, siteId, displayName, alt, version],
    );
    if (!updated.rows[0]) throw new OperationValidationError("conflict");
    await audit(client, {
      tenantId: site.tenantId,
      action: "media_metadata_updated",
      resourceType: "media_asset",
      resourceId: assetId,
      correlationId,
    });
    return siteId;
  });
}

export async function setMediaArchived(
  session: AuthSession,
  form: FormData,
  correlationId: string,
  archived: boolean,
): Promise<string> {
  const siteId = requireUuid(String(form.get("site_id") || ""));
  const assetId = requireUuid(String(form.get("asset_id") || ""));
  const version = Number(form.get("version"));
  return withMediaContext(session, correlationId, async (client) => {
    const site = await siteForWrite(client, session, siteId);
    if (archived) {
      const used = await client.query(
        `SELECT 1 FROM public.content_media_references reference
         LEFT JOIN public.sites current_site ON current_site.id=reference.site_id
         WHERE reference.asset_id=$1 AND (
           reference.owner_kind='draft'
           OR reference.publication_id=current_site.current_publication_id
         ) LIMIT 1`,
        [assetId],
      );
      if (used.rows[0]) throw new MediaOperationError("in_use");
    }
    const updated = await client.query(
      archived
        ? `UPDATE public.media_assets SET status='archived',
             archived_at=transaction_timestamp(),archived_by_user_id=$4,
             version=version+1
           WHERE id=$1 AND tenant_id=$2 AND site_id=$3 AND version=$5
             AND status='ready' RETURNING id`
        : `UPDATE public.media_assets SET status='ready',archived_at=NULL,
             archived_by_user_id=NULL,version=version+1
           WHERE id=$1 AND tenant_id=$2 AND site_id=$3 AND version=$5
             AND status='archived' RETURNING id`,
      [assetId, site.tenantId, siteId, session.userId, version],
    );
    if (!updated.rows[0]) throw new OperationValidationError("conflict");
    await audit(client, {
      tenantId: site.tenantId,
      action: archived ? "media_asset_archived" : "media_asset_restored",
      resourceType: "media_asset",
      resourceId: assetId,
      correlationId,
    });
    return siteId;
  });
}

export async function privateMediaObject(
  session: AuthSession,
  assetId: string,
  variant: MediaVariantName,
): Promise<Awaited<ReturnType<typeof readLocalMedia>> | null> {
  if (!UUID.test(assetId) || !["thumbnail", "card", "hero"].includes(variant)) {
    return null;
  }
  const row = await withMediaContext(session, correlation("media-private"), async (client) => {
    const result = await client.query<{ storageKey: string }>(
      `SELECT variant.storage_key AS "storageKey"
       FROM public.media_variants variant
       JOIN public.media_assets asset ON asset.id=variant.asset_id
       JOIN public.sites site ON site.id=asset.site_id
       WHERE asset.id=$1 AND variant.variant_name=$2
         AND variant.status='ready'
         AND asset.status IN ('ready','archived')
         AND site.deleted_at IS NULL
         AND ($3::boolean OR asset.tenant_id=app_context.current_tenant_id())
       LIMIT 1`,
      [assetId, variant, session.audience === "nexi_admin"],
    );
    return result.rows[0] ?? null;
  });
  return row ? readLocalMedia(row.storageKey) : null;
}

export async function publicMediaObject(
  assetId: string,
  variant: MediaVariantName,
  checksum: string,
): Promise<Awaited<ReturnType<typeof readLocalMedia>> | null> {
  if (
    !UUID.test(assetId) ||
    !["thumbnail", "card", "hero"].includes(variant) ||
    !/^[0-9a-f]{64}$/.test(checksum)
  ) return null;
  const row = await withApplicationDatabase(async (pool) => {
    const result = await pool.query<{ storageKey: string }>(
      `SELECT storage_key AS "storageKey"
       FROM app_private.resolve_public_media($1,$2,$3)`,
      [assetId, variant, checksum],
    );
    return result.rows[0] ?? null;
  });
  return row ? readLocalMedia(row.storageKey) : null;
}

export async function mediaManifestForOwner(
  client: Pick<PoolClient, "query">,
  owner: { draftId?: string; publicationId?: string },
  visibility: "private" | "public",
  privateAudience: "client_admin" | "nexi_admin" = "client_admin",
): Promise<MediaRenderManifest> {
  const ownerColumn = owner.draftId ? "draft_id" : "publication_id";
  const ownerId = owner.draftId ?? owner.publicationId;
  if (!ownerId) return {};
  const result = await client.query<{
    assetId: string;
    variantName: MediaVariantName;
    checksum: string;
    width: number;
    height: number;
  }>(
    visibility === "public" && owner.publicationId
      ? `SELECT asset_id AS "assetId",variant_name AS "variantName",
           checksum_sha256 AS checksum,width,height
         FROM app_private.resolve_publication_media_manifest($1)`
      : `SELECT DISTINCT asset.id AS "assetId",
           variant.variant_name AS "variantName",
           variant.checksum_sha256 AS checksum,variant.width,variant.height
         FROM public.content_media_references reference
         JOIN public.media_assets asset ON asset.id=reference.asset_id
         JOIN public.media_variants variant ON variant.asset_id=asset.id
         WHERE reference.${ownerColumn}=$1 AND variant.status='ready'`,
    [ownerId],
  );
  return result.rows.reduce<MediaRenderManifest>((manifest, row) => {
    manifest[row.assetId] ??= {};
    manifest[row.assetId][row.variantName] = {
      url: visibility === "public"
        ? `/media/${row.assetId}/${row.variantName}/${row.checksum}`
        : `/api/media/private/${row.assetId}/${row.variantName}${
          privateAudience === "nexi_admin" ? "?audience=admin" : ""
        }`,
      width: row.width,
      height: row.height,
    };
    return manifest;
  }, {});
}

export function safeMediaError(error: unknown): OperationValidationError {
  return mapOperationError(error);
}
