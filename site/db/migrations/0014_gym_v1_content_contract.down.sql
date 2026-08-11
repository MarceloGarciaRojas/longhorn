DO $block$
BEGIN
  IF EXISTS(
    SELECT 1 FROM public.site_content_drafts
    WHERE schema_key='gym.v1'
  ) THEN
    RAISE EXCEPTION 'cannot rollback 0014 while gym.v1 drafts exist'
      USING ERRCODE='23514';
  END IF;
END
$block$;

CREATE OR REPLACE FUNCTION app_private.enforce_content_media_reference()
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

ALTER TABLE public.content_media_references
  DROP CONSTRAINT content_media_field_valid;
ALTER TABLE public.content_media_references
  ADD CONSTRAINT content_media_field_valid CHECK (
    field_path = 'hero.media'
    OR field_path ~ '^menu\.items\.[0-9]+\.media$'
  );

CREATE OR REPLACE FUNCTION app_private.enforce_content_draft_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE expected_tenant uuid;
BEGIN
  SELECT site.tenant_id INTO expected_tenant
  FROM public.sites site
  JOIN public.site_template_assignments assignment
    ON assignment.site_id = site.id
   AND assignment.tenant_id = site.tenant_id
   AND assignment.status = 'active'
   AND assignment.schema_key = NEW.schema_key
   AND assignment.schema_version = NEW.schema_version
  WHERE site.id = NEW.site_id
    AND site.status IN ('preparing', 'active')
    AND site.deleted_at IS NULL;
  IF expected_tenant IS NULL OR expected_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'draft site mismatch or unavailable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION app_private.enforce_site_industry_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $function$
BEGIN
  IF NEW.industry_key IS NOT DISTINCT FROM OLD.industry_key THEN
    RETURN NEW;
  END IF;
  IF EXISTS(
    SELECT 1
    FROM public.site_template_assignments assignment
    JOIN public.template_versions version ON version.id=assignment.template_version_id
    JOIN public.templates template ON template.id=version.template_id
    WHERE assignment.site_id=NEW.id
      AND template.industry_key <> NEW.industry_key
  ) THEN
    RAISE EXCEPTION 'site industry incompatible with assignment'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$function$;

ALTER TABLE public.site_content_drafts
  DROP CONSTRAINT site_content_draft_schema_valid;
ALTER TABLE public.site_content_drafts
  ADD CONSTRAINT site_content_draft_schema_valid CHECK (
    (schema_key = 'restaurant.v1' AND schema_version = 1)
    OR (schema_key = 'restaurant.v2' AND schema_version = 2)
  );
