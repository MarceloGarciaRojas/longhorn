ALTER TABLE public.site_content_drafts
  DROP CONSTRAINT site_content_draft_schema_valid;
ALTER TABLE public.site_content_drafts
  ADD CONSTRAINT site_content_draft_schema_valid CHECK (
    (schema_key = 'restaurant.v1' AND schema_version = 1)
    OR (schema_key = 'restaurant.v2' AND schema_version = 2)
  );

ALTER TABLE public.site_content_publications
  DROP CONSTRAINT site_content_publication_schema_valid;
ALTER TABLE public.site_content_publications
  ADD CONSTRAINT site_content_publication_schema_valid CHECK (
    (schema_key = 'restaurant.v1' AND schema_version = 1)
    OR (schema_key = 'restaurant.v2' AND schema_version = 2)
  );

ALTER TABLE public.template_versions
  ADD COLUMN preview_key text;
ALTER TABLE public.template_versions
  ADD CONSTRAINT template_versions_preview_key_valid CHECK (
    preview_key IS NULL
    OR preview_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  );

CREATE OR REPLACE FUNCTION app_private.resolve_public_site(
  requested_hostname text,
  requested_slug text
) RETURNS TABLE(
  site_id uuid,
  site_slug text,
  public_state text,
  canonical_hostname text,
  renderer_key text,
  schema_key text,
  schema_version integer,
  publication_id uuid,
  publication_number integer,
  content_snapshot jsonb
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  WITH candidate AS (
    SELECT site.id,site.slug,site.status AS site_status,
      site.current_publication_id,site.tenant_id,tenant.status AS tenant_status
    FROM public.sites site
    JOIN public.tenants tenant ON tenant.id=site.tenant_id
    LEFT JOIN public.site_domains requested_domain
      ON requested_domain.site_id=site.id
     AND requested_domain.tenant_id=site.tenant_id
     AND requested_domain.hostname=lower(btrim(requested_hostname))
     AND requested_domain.status='active'
     AND requested_domain.verification_status='verified'
    WHERE site.deleted_at IS NULL AND tenant.deleted_at IS NULL
      AND (
        (requested_hostname IS NOT NULL AND requested_domain.id IS NOT NULL)
        OR (
          requested_hostname IS NULL AND requested_slug IS NOT NULL
          AND site.slug=lower(btrim(requested_slug))
          AND (
            SELECT count(*) FROM public.sites duplicate
            WHERE duplicate.slug=lower(btrim(requested_slug))
              AND duplicate.deleted_at IS NULL
          )=1
        )
      )
    LIMIT 1
  )
  SELECT candidate.id,candidate.slug,
    CASE
      WHEN candidate.tenant_status='active'
       AND candidate.site_status='active'
       AND publication.id IS NOT NULL
       AND version.status IN ('active','deprecated')
      THEN 'published'
      WHEN candidate.tenant_status='active'
       AND candidate.site_status IN ('preparing','active')
      THEN 'preparing'
      ELSE 'unavailable'
    END,
    primary_domain.hostname,
    CASE WHEN publication.id IS NOT NULL THEN version.renderer_key END,
    CASE WHEN publication.id IS NOT NULL THEN publication.schema_key END,
    CASE WHEN publication.id IS NOT NULL THEN publication.schema_version END,
    CASE WHEN publication.id IS NOT NULL THEN publication.id END,
    CASE WHEN publication.id IS NOT NULL THEN publication.publication_number END,
    CASE
      WHEN candidate.tenant_status='active'
       AND candidate.site_status='active'
       AND version.status IN ('active','deprecated')
      THEN publication.content_snapshot
    END
  FROM candidate
  LEFT JOIN public.site_content_publications publication
    ON publication.id=candidate.current_publication_id
   AND publication.site_id=candidate.id
   AND publication.tenant_id=candidate.tenant_id
  LEFT JOIN public.template_versions version
    ON version.id=publication.template_version_id
  LEFT JOIN LATERAL (
    SELECT domain.hostname FROM public.site_domains domain
    WHERE domain.site_id=candidate.id
      AND domain.tenant_id=candidate.tenant_id
      AND domain.is_primary AND domain.status='active'
      AND domain.verification_status='verified'
    ORDER BY domain.created_at DESC LIMIT 1
  ) primary_domain ON true
$function$;

CREATE TABLE public.plan_media_capabilities (
  plan_id uuid PRIMARY KEY REFERENCES public.plans(id) ON DELETE RESTRICT,
  media_library_enabled boolean NOT NULL DEFAULT false,
  media_asset_limit integer NOT NULL,
  media_storage_bytes bigint NOT NULL,
  media_upload_max_bytes bigint NOT NULL,
  media_allowed_mime_types text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT plan_media_asset_limit_valid CHECK (
    media_asset_limit BETWEEN 0 AND 10000
  ),
  CONSTRAINT plan_media_storage_valid CHECK (
    media_storage_bytes BETWEEN 0 AND 1099511627776
  ),
  CONSTRAINT plan_media_upload_valid CHECK (
    media_upload_max_bytes BETWEEN 1 AND 104857600
    AND media_upload_max_bytes <= media_storage_bytes
  ),
  CONSTRAINT plan_media_mime_types_valid CHECK (
    cardinality(media_allowed_mime_types) BETWEEN 1 AND 8
    AND media_allowed_mime_types <@ ARRAY[
      'image/jpeg','image/png','image/webp'
    ]::text[]
  )
);
CREATE TRIGGER plan_media_capabilities_set_updated_at BEFORE UPDATE
  ON public.plan_media_capabilities FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  source_kind text NOT NULL,
  storage_provider text NOT NULL,
  storage_key text,
  bundled_reference text,
  original_filename text NOT NULL,
  display_name text NOT NULL,
  default_alt_text text NOT NULL DEFAULT '',
  detected_mime_type text NOT NULL,
  normalized_mime_type text,
  byte_size bigint NOT NULL,
  width integer,
  height integer,
  pixel_count bigint,
  checksum_sha256 text,
  status text NOT NULL DEFAULT 'processing',
  rejection_code text,
  uploaded_by_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  upload_idempotency_key uuid NOT NULL,
  archived_at timestamptz,
  archived_by_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT media_assets_source_valid CHECK (
    source_kind IN ('bundled','uploaded')
  ),
  CONSTRAINT media_assets_provider_valid CHECK (
    storage_provider IN ('bundled','local')
  ),
  CONSTRAINT media_assets_key_valid CHECK (
    storage_key IS NULL
    OR (
      length(storage_key) BETWEEN 12 AND 1024
      AND storage_key !~ '(^|/)\.\.?(/|$)'
      AND storage_key !~ '^[A-Za-z]:'
      AND storage_key !~ '^[/\\]'
    )
  ),
  CONSTRAINT media_assets_bundled_reference_valid CHECK (
    (source_kind = 'bundled'
      AND bundled_reference ~ '^restaurant-(hero|dish-a|dish-b|dessert)$')
    OR (source_kind = 'uploaded' AND bundled_reference IS NULL)
  ),
  CONSTRAINT media_assets_filename_valid CHECK (
    length(btrim(original_filename)) BETWEEN 1 AND 120
  ),
  CONSTRAINT media_assets_display_name_valid CHECK (
    length(btrim(display_name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT media_assets_alt_valid CHECK (
    length(default_alt_text) <= 250
  ),
  CONSTRAINT media_assets_mime_valid CHECK (
    detected_mime_type IN ('image/jpeg','image/png','image/webp')
    AND (
      normalized_mime_type IS NULL
      OR normalized_mime_type = 'image/webp'
    )
  ),
  CONSTRAINT media_assets_size_valid CHECK (
    byte_size BETWEEN 1 AND 104857600
  ),
  CONSTRAINT media_assets_dimensions_valid CHECK (
    (width IS NULL AND height IS NULL AND pixel_count IS NULL)
    OR (
      width BETWEEN 1 AND 8000
      AND height BETWEEN 1 AND 8000
      AND pixel_count = width::bigint * height::bigint
      AND pixel_count <= 40000000
    )
  ),
  CONSTRAINT media_assets_checksum_valid CHECK (
    checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT media_assets_status_valid CHECK (
    status IN ('processing','ready','rejected','failed','archived')
  ),
  CONSTRAINT media_assets_rejection_valid CHECK (
    (status IN ('rejected','failed') AND rejection_code IS NOT NULL)
    OR (status NOT IN ('rejected','failed') AND rejection_code IS NULL)
  ),
  CONSTRAINT media_assets_archive_valid CHECK (
    (status = 'archived' AND archived_at IS NOT NULL AND archived_by_user_id IS NOT NULL)
    OR (status <> 'archived' AND archived_at IS NULL AND archived_by_user_id IS NULL)
  ),
  CONSTRAINT media_assets_version_valid CHECK (version > 0),
  CONSTRAINT media_assets_upload_idempotency_unique UNIQUE (
    tenant_id,site_id,uploaded_by_user_id,upload_idempotency_key
  ),
  CONSTRAINT media_assets_bundled_unique UNIQUE(site_id,bundled_reference)
);
CREATE INDEX media_assets_site_created_idx
  ON public.media_assets(tenant_id,site_id,created_at DESC,id DESC);
CREATE INDEX media_assets_site_status_idx
  ON public.media_assets(tenant_id,site_id,status,created_at DESC);
CREATE INDEX media_assets_site_search_idx
  ON public.media_assets(tenant_id,site_id,lower(display_name));
CREATE INDEX media_assets_checksum_idx
  ON public.media_assets(tenant_id,site_id,checksum_sha256)
  WHERE checksum_sha256 IS NOT NULL;
CREATE TRIGGER media_assets_set_updated_at BEFORE UPDATE
  ON public.media_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.media_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE RESTRICT,
  variant_name text NOT NULL,
  storage_provider text NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/webp',
  byte_size bigint NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  checksum_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT media_variants_asset_name_unique UNIQUE(asset_id,variant_name),
  CONSTRAINT media_variants_name_valid CHECK (
    variant_name IN ('thumbnail','card','hero')
  ),
  CONSTRAINT media_variants_provider_valid CHECK (
    storage_provider IN ('bundled','local')
  ),
  CONSTRAINT media_variants_key_valid CHECK (
    length(storage_key) BETWEEN 12 AND 1024
    AND storage_key !~ '(^|/)\.\.?(/|$)'
    AND storage_key !~ '^[A-Za-z]:'
    AND storage_key !~ '^[/\\]'
  ),
  CONSTRAINT media_variants_mime_valid CHECK (mime_type = 'image/webp'),
  CONSTRAINT media_variants_size_valid CHECK (byte_size > 0),
  CONSTRAINT media_variants_dimensions_valid CHECK (
    width BETWEEN 1 AND 1600 AND height BETWEEN 1 AND 8000
  ),
  CONSTRAINT media_variants_checksum_valid CHECK (
    checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT media_variants_status_valid CHECK (status IN ('ready','failed'))
);
CREATE INDEX media_variants_site_asset_idx
  ON public.media_variants(tenant_id,site_id,asset_id);

CREATE TABLE public.content_media_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  owner_kind text NOT NULL,
  draft_id uuid REFERENCES public.site_content_drafts(id) ON DELETE RESTRICT,
  publication_id uuid REFERENCES public.site_content_publications(id) ON DELETE RESTRICT,
  field_path text NOT NULL,
  asset_id uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE RESTRICT,
  alt_text text NOT NULL,
  decorative boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT content_media_owner_valid CHECK (
    (owner_kind='draft' AND draft_id IS NOT NULL AND publication_id IS NULL)
    OR
    (owner_kind='publication' AND publication_id IS NOT NULL AND draft_id IS NULL)
  ),
  CONSTRAINT content_media_field_valid CHECK (
    field_path = 'hero.media'
    OR field_path ~ '^menu\.items\.[0-9]+\.media$'
  ),
  CONSTRAINT content_media_alt_valid CHECK (
    (decorative AND alt_text = '')
    OR (NOT decorative AND length(btrim(alt_text)) BETWEEN 1 AND 250)
  ),
  CONSTRAINT content_media_draft_field_unique UNIQUE(draft_id,field_path),
  CONSTRAINT content_media_publication_field_unique UNIQUE(publication_id,field_path)
);
CREATE INDEX content_media_asset_idx
  ON public.content_media_references(tenant_id,site_id,asset_id);
CREATE INDEX content_media_publication_idx
  ON public.content_media_references(publication_id,asset_id)
  WHERE owner_kind='publication';

CREATE TABLE public.site_template_assignment_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL
    REFERENCES public.site_template_assignments(id) ON DELETE RESTRICT,
  previous_template_version_id uuid
    REFERENCES public.template_versions(id) ON DELETE RESTRICT,
  new_template_version_id uuid NOT NULL
    REFERENCES public.template_versions(id) ON DELETE RESTRICT,
  previous_schema_key text,
  previous_schema_version integer,
  new_schema_key text NOT NULL,
  new_schema_version integer NOT NULL,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  draft_revision integer,
  idempotency_key uuid NOT NULL,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT template_history_idempotency_unique UNIQUE(idempotency_key),
  CONSTRAINT template_history_reason_valid CHECK (
    reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500
  )
);
CREATE INDEX template_history_site_idx
  ON public.site_template_assignment_history(site_id,changed_at DESC,id DESC);

CREATE FUNCTION app_private.enforce_media_asset_site()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $function$
DECLARE expected_tenant uuid;
BEGIN
  SELECT tenant_id INTO expected_tenant
  FROM public.sites
  WHERE id=NEW.site_id AND deleted_at IS NULL;
  IF expected_tenant IS NULL OR expected_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'media site mismatch' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.site_id IS DISTINCT FROM OLD.site_id
    OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
    OR NEW.uploaded_by_user_id IS DISTINCT FROM OLD.uploaded_by_user_id
    OR NEW.upload_idempotency_key IS DISTINCT FROM OLD.upload_idempotency_key
  ) THEN
    RAISE EXCEPTION 'immutable media ownership' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER media_assets_site_consistency
  BEFORE INSERT OR UPDATE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_media_asset_site();

CREATE FUNCTION app_private.enforce_media_variant_asset()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $function$
DECLARE valid_asset boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.media_assets asset
    WHERE asset.id=NEW.asset_id
      AND asset.tenant_id=NEW.tenant_id
      AND asset.site_id=NEW.site_id
  ) INTO valid_asset;
  IF NOT valid_asset THEN
    RAISE EXCEPTION 'media variant mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER media_variants_asset_consistency
  BEFORE INSERT OR UPDATE ON public.media_variants
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_media_variant_asset();

CREATE FUNCTION app_private.enforce_content_media_reference()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $function$
DECLARE owner_tenant uuid;
DECLARE owner_site uuid;
DECLARE asset_status text;
DECLARE asset_archived_at timestamptz;
BEGIN
  IF NEW.owner_kind='draft' THEN
    SELECT tenant_id,site_id INTO owner_tenant,owner_site
    FROM public.site_content_drafts WHERE id=NEW.draft_id;
  ELSE
    SELECT tenant_id,site_id INTO owner_tenant,owner_site
    FROM public.site_content_publications WHERE id=NEW.publication_id;
  END IF;
  SELECT status,archived_at INTO asset_status,asset_archived_at
  FROM public.media_assets
  WHERE id=NEW.asset_id
    AND tenant_id=NEW.tenant_id
    AND site_id=NEW.site_id;
  IF owner_tenant IS NULL
    OR owner_tenant <> NEW.tenant_id
    OR owner_site <> NEW.site_id
    OR asset_status IS NULL
  THEN
    RAISE EXCEPTION 'content media ownership mismatch' USING ERRCODE='23514';
  END IF;
  IF asset_status <> 'ready' OR asset_archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'content media unavailable' USING ERRCODE='23514';
  END IF;
  IF (
    SELECT count(*) FROM public.media_variants variant
    WHERE variant.asset_id=NEW.asset_id AND variant.status='ready'
      AND variant.variant_name IN ('thumbnail','card','hero')
  ) <> 3 THEN
    RAISE EXCEPTION 'content media variants unavailable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER content_media_reference_consistency
  BEFORE INSERT OR UPDATE ON public.content_media_references
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_content_media_reference();

CREATE FUNCTION app_private.prevent_publication_media_changes()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF COALESCE(OLD.owner_kind,NEW.owner_kind)='publication' THEN
    RAISE EXCEPTION 'publication media references are immutable'
      USING ERRCODE='42501';
  END IF;
  RETURN COALESCE(NEW,OLD);
END
$function$;
CREATE TRIGGER publication_media_references_immutable
  BEFORE UPDATE OR DELETE ON public.content_media_references
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_publication_media_changes();

CREATE FUNCTION app_private.record_template_assignment_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
BEGIN
  IF NEW.template_version_id IS NOT DISTINCT FROM OLD.template_version_id THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.site_template_assignment_history(
    tenant_id,site_id,assignment_id,previous_template_version_id,
    new_template_version_id,previous_schema_key,previous_schema_version,
    new_schema_key,new_schema_version,actor_user_id,draft_revision,
    idempotency_key
  ) VALUES(
    NEW.tenant_id,NEW.site_id,NEW.id,OLD.template_version_id,
    NEW.template_version_id,OLD.schema_key,OLD.schema_version,
    NEW.schema_key,NEW.schema_version,
    nullif(current_setting('app.current_user_id',true),'')::uuid,
    (SELECT revision FROM public.site_content_drafts WHERE site_id=NEW.site_id),
    NEW.idempotency_key
  );
  RETURN NEW;
END
$function$;
CREATE TRIGGER site_template_assignment_history
  AFTER UPDATE OF template_version_id ON public.site_template_assignments
  FOR EACH ROW EXECUTE FUNCTION app_private.record_template_assignment_history();

CREATE FUNCTION app_private.protect_client_template_assignment_update()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $function$
DECLARE target_valid boolean;
BEGIN
  IF current_user='nexi_migrator'
    OR app_private.current_actor_is_nexi_admin()
  THEN RETURN NEW; END IF;
  SELECT EXISTS(
    SELECT 1 FROM public.template_versions version
    JOIN public.templates template ON template.id=version.template_id
    WHERE version.id=NEW.template_version_id
      AND version.status='active' AND template.status='active'
      AND template.industry_key='restaurant'
      AND version.content_schema_key=NEW.schema_key
      AND NEW.schema_version BETWEEN version.minimum_schema_version
                                 AND version.maximum_schema_version
  ) INTO target_valid;
  IF NOT app_private.current_actor_is_active_member()
    OR NEW.tenant_id <> app_context.current_tenant_id()
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.site_id IS DISTINCT FROM OLD.site_id
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.assigned_by_user_id <> app_context.current_user_id()
    OR NEW.version <> OLD.version+1
    OR NEW.idempotency_key IS NOT DISTINCT FROM OLD.idempotency_key
    OR NOT target_valid
    OR NOT (
      (NEW.schema_key=OLD.schema_key AND NEW.schema_version=OLD.schema_version)
      OR (
        OLD.schema_key='restaurant.v1' AND OLD.schema_version=1
        AND NEW.schema_key='restaurant.v2' AND NEW.schema_version=2
      )
      OR (
        OLD.schema_key='restaurant.v2' AND OLD.schema_version=2
        AND NEW.schema_key='restaurant.v1' AND NEW.schema_version=1
      )
    )
  THEN
    RAISE EXCEPTION 'client template assignment update denied'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER client_template_assignment_update_fields
  BEFORE UPDATE ON public.site_template_assignments
  FOR EACH ROW EXECUTE FUNCTION app_private.protect_client_template_assignment_update();

ALTER TABLE public.plan_media_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_media_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_template_assignment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY templates_client_catalog_select ON public.templates FOR SELECT
  USING (
    status='active' AND industry_key='restaurant'
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY template_versions_client_catalog_select
  ON public.template_versions FOR SELECT
  USING (
    status='active'
    AND app_private.current_actor_is_active_member()
    AND EXISTS(
      SELECT 1
      FROM public.site_content_drafts draft
      WHERE draft.tenant_id=app_context.current_tenant_id()
        AND draft.schema_key=template_versions.content_schema_key
        AND draft.schema_version BETWEEN
          template_versions.minimum_schema_version
          AND template_versions.maximum_schema_version
    )
  );

CREATE POLICY plan_media_admin_all ON public.plan_media_capabilities FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY plan_media_client_select ON public.plan_media_capabilities FOR SELECT
  USING (
    app_private.current_actor_is_active_member()
    AND EXISTS(
      SELECT 1 FROM public.tenant_plan_assignments assignment
      WHERE assignment.tenant_id=app_context.current_tenant_id()
        AND assignment.plan_id=plan_media_capabilities.plan_id
        AND assignment.status='active'
    )
  );

CREATE POLICY media_assets_admin_all ON public.media_assets FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY media_assets_client_select ON public.media_assets FOR SELECT
  USING (
    tenant_id=app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY media_assets_client_insert ON public.media_assets FOR INSERT
  WITH CHECK (
    tenant_id=app_context.current_tenant_id()
    AND uploaded_by_user_id=app_context.current_user_id()
    AND source_kind='uploaded'
    AND storage_provider='local'
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY media_assets_client_update ON public.media_assets FOR UPDATE
  USING (
    tenant_id=app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  )
  WITH CHECK (
    tenant_id=app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  );

CREATE POLICY media_variants_admin_all ON public.media_variants FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY media_variants_client_select ON public.media_variants FOR SELECT
  USING (
    tenant_id=app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY media_variants_client_insert ON public.media_variants FOR INSERT
  WITH CHECK (
    tenant_id=app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  );

CREATE POLICY content_media_admin_all ON public.content_media_references FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY content_media_client_select ON public.content_media_references FOR SELECT
  USING (
    tenant_id=app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY content_media_client_insert ON public.content_media_references FOR INSERT
  WITH CHECK (
    tenant_id=app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY content_media_client_update ON public.content_media_references FOR UPDATE
  USING (
    tenant_id=app_context.current_tenant_id()
    AND owner_kind='draft'
    AND app_private.current_actor_is_active_member()
  )
  WITH CHECK (
    tenant_id=app_context.current_tenant_id()
    AND owner_kind='draft'
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY content_media_client_delete ON public.content_media_references FOR DELETE
  USING (
    tenant_id=app_context.current_tenant_id()
    AND owner_kind='draft'
    AND app_private.current_actor_is_active_member()
  );

CREATE POLICY template_history_admin_select
  ON public.site_template_assignment_history FOR SELECT
  USING (app_private.current_actor_is_nexi_admin());
CREATE POLICY template_history_client_select
  ON public.site_template_assignment_history FOR SELECT
  USING (
    tenant_id=app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY template_assignments_client_update
  ON public.site_template_assignments FOR UPDATE
  USING (
    tenant_id=app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  )
  WITH CHECK (
    tenant_id=app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  );

REVOKE ALL ON TABLE public.plan_media_capabilities,public.media_assets,
  public.media_variants,public.content_media_references,
  public.site_template_assignment_history FROM PUBLIC,nexi_app;
GRANT SELECT ON public.plan_media_capabilities TO nexi_app;
GRANT SELECT,INSERT,UPDATE ON public.media_assets TO nexi_app;
GRANT SELECT,INSERT ON public.media_variants TO nexi_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.content_media_references TO nexi_app;
GRANT SELECT ON public.site_template_assignment_history TO nexi_app;

ALTER TABLE public.platform_audit_events
  DROP CONSTRAINT platform_audit_action_valid;
ALTER TABLE public.platform_audit_events
  ADD CONSTRAINT platform_audit_action_valid CHECK (
    action IN (
      'tenant_created','tenant_updated','tenant_activated','tenant_suspended',
      'tenant_reactivated','invitation_created','invitation_resent','invitation_failed',
      'invitation_revoked','invitation_accepted','membership_created',
      'membership_disabled','membership_reactivated','admin_access_denied',
      'client_panel_accessed','personal_profile_updated','tenant_profile_updated',
      'site_created','site_updated','subdomain_assigned','deletion_requested',
      'deletion_canceled','deletion_approved','deletion_rejected','site_archived',
      'domain_requested','domain_status_changed','domain_registered',
      'conversation_created','conversation_closed','conversation_reopened',
      'conversation_priority_changed','support_message_sent','operation_access_denied',
      'template_assigned','template_version_changed','content_initialized',
      'content_draft_saved','content_edit_conflict','content_previewed',
      'content_published','content_restored','content_publish_rejected',
      'content_access_denied','renderer_unknown','public_resolution_failed',
      'media_upload_started','media_upload_completed','media_asset_rejected',
      'media_processing_started','media_processing_completed','media_processing_failed',
      'media_asset_archived','media_asset_restored','media_metadata_updated',
      'media_reference_added','media_reference_removed','media_published',
      'template_previewed','template_changed','media_cross_tenant_blocked',
      'media_quota_exceeded','media_format_rejected','media_dimensions_rejected',
      'restaurant_v2_migrated','media_local_provider_blocked'
    )
  );
ALTER TABLE public.platform_audit_events
  DROP CONSTRAINT platform_audit_resource_type_valid;
ALTER TABLE public.platform_audit_events
  ADD CONSTRAINT platform_audit_resource_type_valid CHECK (
    resource_type IN (
      'tenant','invitation','membership','admin_route','client_route',
      'user_profile','tenant_profile','site','deletion_request','domain_request',
      'domain','conversation','message','outbox','template','template_version',
      'template_assignment','template_history','content_draft','content_publication',
      'public_site','media_asset','media_variant','media_reference','media_quota'
    )
  );

CREATE FUNCTION app_private.media_record_event(
  requested_tenant_id uuid,
  requested_action text,
  requested_resource_type text,
  requested_resource_id text,
  requested_correlation_id text,
  requested_outcome text,
  requested_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
DECLARE actor_id uuid;
DECLARE created_event_id bigint;
BEGIN
  actor_id := nullif(current_setting('app.current_user_id',true),'')::uuid;
  IF NOT (
    app_private.current_actor_is_nexi_admin()
    OR (
      requested_tenant_id=app_context.current_tenant_id()
      AND app_private.current_actor_is_active_member()
    )
  ) THEN
    RAISE EXCEPTION 'media audit denied' USING ERRCODE='42501';
  END IF;
  IF requested_action NOT IN (
    'media_upload_started','media_upload_completed','media_asset_rejected',
    'media_processing_started','media_processing_completed','media_processing_failed',
    'media_asset_archived','media_asset_restored','media_metadata_updated',
    'media_reference_added','media_reference_removed','media_published',
    'template_previewed','template_changed','media_cross_tenant_blocked',
    'media_quota_exceeded','media_format_rejected','media_dimensions_rejected',
    'restaurant_v2_migrated','media_local_provider_blocked'
  ) OR requested_resource_type NOT IN (
    'media_asset','media_variant','media_reference','media_quota',
    'template_assignment','template_history','content_draft','content_publication'
  ) OR requested_outcome NOT IN ('succeeded','failed','blocked') THEN
    RAISE EXCEPTION 'invalid media audit event' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.platform_audit_events(
    actor_user_id,tenant_id,action,resource_type,resource_id,outcome,
    correlation_id,metadata
  ) VALUES(
    actor_id,requested_tenant_id,requested_action,requested_resource_type,
    requested_resource_id,requested_outcome,requested_correlation_id,
    COALESCE(requested_metadata,'{}'::jsonb)
  ) RETURNING id INTO created_event_id;
  RETURN created_event_id;
END
$function$;
REVOKE ALL ON FUNCTION app_private.media_record_event(
  uuid,text,text,text,text,text,jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.media_record_event(
  uuid,text,text,text,text,text,jsonb
) TO nexi_app;

CREATE FUNCTION app_private.resolve_public_media(
  requested_asset_id uuid,
  requested_variant text,
  requested_checksum text
) RETURNS TABLE(
  storage_provider text,
  storage_key text,
  mime_type text,
  byte_size bigint,
  etag text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $function$
  SELECT variant.storage_provider,variant.storage_key,variant.mime_type,
    variant.byte_size,variant.checksum_sha256
  FROM public.media_assets asset
  JOIN public.media_variants variant ON variant.asset_id=asset.id
  JOIN public.content_media_references reference ON reference.asset_id=asset.id
  JOIN public.site_content_publications publication
    ON publication.id=reference.publication_id
  JOIN public.sites site
    ON site.id=publication.site_id AND site.current_publication_id=publication.id
  JOIN public.tenants tenant ON tenant.id=site.tenant_id
  WHERE asset.id=requested_asset_id
    AND variant.variant_name=requested_variant
    AND variant.checksum_sha256=requested_checksum
    AND reference.owner_kind='publication'
    AND asset.status IN ('ready','archived')
    AND variant.status='ready'
    AND site.status='active' AND site.deleted_at IS NULL
    AND tenant.status='active' AND tenant.deleted_at IS NULL
  LIMIT 1
$function$;
REVOKE ALL ON FUNCTION app_private.resolve_public_media(uuid,text,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.resolve_public_media(uuid,text,text)
  TO nexi_app;

CREATE FUNCTION app_private.resolve_publication_media_manifest(
  requested_publication_id uuid
) RETURNS TABLE(
  asset_id uuid,
  variant_name text,
  checksum_sha256 text,
  width integer,
  height integer
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $function$
  SELECT DISTINCT asset.id,variant.variant_name,variant.checksum_sha256,
    variant.width,variant.height
  FROM public.sites site
  JOIN public.tenants tenant ON tenant.id=site.tenant_id
  JOIN public.site_content_publications publication
    ON publication.id=site.current_publication_id
  JOIN public.content_media_references reference
    ON reference.publication_id=publication.id
  JOIN public.media_assets asset ON asset.id=reference.asset_id
  JOIN public.media_variants variant ON variant.asset_id=asset.id
  WHERE publication.id=requested_publication_id
    AND site.status='active' AND site.deleted_at IS NULL
    AND tenant.status='active' AND tenant.deleted_at IS NULL
    AND reference.owner_kind='publication'
    AND asset.status IN ('ready','archived')
    AND variant.status='ready'
$function$;
REVOKE ALL ON FUNCTION app_private.resolve_publication_media_manifest(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.resolve_publication_media_manifest(uuid)
  TO nexi_app;
