import "server-only";

import type { PoolClient } from "pg";
import type { RegisteredContent, RestaurantContentV2 } from "./types";
import {
  RESTAURANT_SCHEMA_KEY,
  RESTAURANT_SCHEMA_VERSION,
  RESTAURANT_V2_SCHEMA_KEY,
  RESTAURANT_V2_SCHEMA_VERSION,
} from "./types";
import { requireCompatibleContentSchema } from "./schema-dispatch";

export interface ContentMediaReferenceInput {
  fieldPath: string;
  assetId: string;
  altText: string;
  decorative: boolean;
}

export function contentMediaReferences(
  industryKey: unknown,
  schemaKey: string,
  schemaVersion: number,
  content: RegisteredContent,
): ContentMediaReferenceInput[] {
  requireCompatibleContentSchema(industryKey, schemaKey, schemaVersion);
  if (
    schemaKey === RESTAURANT_SCHEMA_KEY &&
    schemaVersion === RESTAURANT_SCHEMA_VERSION
  ) return [];
  if (
    schemaKey !== RESTAURANT_V2_SCHEMA_KEY ||
    schemaVersion !== RESTAURANT_V2_SCHEMA_VERSION
  ) {
    throw new Error("media_extractor_unavailable");
  }
  const v2 = content as RestaurantContentV2;
  const result: ContentMediaReferenceInput[] = [];
  if (v2.hero.media) {
    result.push({
      fieldPath: "hero.media",
      assetId: v2.hero.media.assetId,
      altText: v2.hero.media.altText,
      decorative: v2.hero.media.decorative,
    });
  }
  v2.menu.items.forEach((item, index) => {
    if (item.media) {
      result.push({
        fieldPath: `menu.items.${index}.media`,
        assetId: item.media.assetId,
        altText: item.media.altText,
        decorative: item.media.decorative,
      });
    }
  });
  return result;
}

export async function replaceDraftMediaReferences(
  client: PoolClient,
  input: {
    tenantId: string;
    siteId: string;
    draftId: string;
    references: ContentMediaReferenceInput[];
  },
): Promise<{ added: number; removed: number }> {
  const prior = await client.query<{ assetId: string; fieldPath: string }>(
    `SELECT asset_id AS "assetId",field_path AS "fieldPath"
     FROM public.content_media_references
     WHERE draft_id=$1 AND owner_kind='draft'`,
    [input.draftId],
  );
  await client.query(
    `DELETE FROM public.content_media_references
     WHERE draft_id=$1 AND owner_kind='draft'`,
    [input.draftId],
  );
  for (const reference of input.references) {
    await client.query(
      `INSERT INTO public.content_media_references(
         tenant_id,site_id,owner_kind,draft_id,field_path,asset_id,
         alt_text,decorative
       ) VALUES($1,$2,'draft',$3,$4,$5,$6,$7)`,
      [
        input.tenantId,
        input.siteId,
        input.draftId,
        reference.fieldPath,
        reference.assetId,
        reference.altText,
        reference.decorative,
      ],
    );
  }
  const before = new Set(prior.rows.map((row) => `${row.fieldPath}:${row.assetId}`));
  const after = new Set(
    input.references.map((row) => `${row.fieldPath}:${row.assetId}`),
  );
  return {
    added: [...after].filter((key) => !before.has(key)).length,
    removed: [...before].filter((key) => !after.has(key)).length,
  };
}

export async function copyDraftMediaToPublication(
  client: PoolClient,
  input: {
    tenantId: string;
    siteId: string;
    draftId: string;
    publicationId: string;
  },
): Promise<number> {
  const result = await client.query(
    `INSERT INTO public.content_media_references(
       tenant_id,site_id,owner_kind,publication_id,field_path,asset_id,
       alt_text,decorative
     )
     SELECT $1,$2,'publication',$4,field_path,asset_id,alt_text,decorative
     FROM public.content_media_references
     WHERE draft_id=$3 AND owner_kind='draft'`,
    [input.tenantId, input.siteId, input.draftId, input.publicationId],
  );
  return result.rowCount ?? 0;
}

export async function copyPublicationMediaReferences(
  client: PoolClient,
  input: {
    tenantId: string;
    siteId: string;
    sourcePublicationId: string;
    targetPublicationId: string;
    draftId: string;
  },
): Promise<number> {
  await client.query(
    `UPDATE public.media_assets asset SET status='ready',archived_at=NULL,
       archived_by_user_id=NULL,version=version+1
     WHERE asset.status='archived' AND EXISTS(
       SELECT 1 FROM public.content_media_references reference
       WHERE reference.publication_id=$1 AND reference.asset_id=asset.id
     )`,
    [input.sourcePublicationId],
  );
  const references = await client.query<ContentMediaReferenceInput>(
    `SELECT field_path AS "fieldPath",asset_id AS "assetId",
       alt_text AS "altText",decorative
     FROM public.content_media_references
     WHERE publication_id=$1 AND owner_kind='publication'`,
    [input.sourcePublicationId],
  );
  await replaceDraftMediaReferences(client, {
    tenantId: input.tenantId,
    siteId: input.siteId,
    draftId: input.draftId,
    references: references.rows,
  });
  const inserted = await client.query(
    `INSERT INTO public.content_media_references(
       tenant_id,site_id,owner_kind,publication_id,field_path,asset_id,
       alt_text,decorative
     )
     SELECT $1,$2,'publication',$4,field_path,asset_id,alt_text,decorative
     FROM public.content_media_references
     WHERE publication_id=$3 AND owner_kind='publication'`,
    [
      input.tenantId,
      input.siteId,
      input.sourcePublicationId,
      input.targetPublicationId,
    ],
  );
  return inserted.rowCount ?? 0;
}
