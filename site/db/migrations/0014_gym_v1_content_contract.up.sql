ALTER TABLE public.site_content_drafts
  DROP CONSTRAINT site_content_draft_schema_valid;
ALTER TABLE public.site_content_drafts
  ADD CONSTRAINT site_content_draft_schema_valid CHECK (
    (schema_key = 'restaurant.v1' AND schema_version = 1)
    OR (schema_key = 'restaurant.v2' AND schema_version = 2)
    OR (schema_key = 'gym.v1' AND schema_version = 1)
  );

CREATE OR REPLACE FUNCTION app_private.enforce_content_draft_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE
  expected_tenant uuid;
  site_industry text;
  compatible_assignment boolean;
BEGIN
  SELECT site.tenant_id,site.industry_key INTO expected_tenant,site_industry
  FROM public.sites site
  WHERE site.id = NEW.site_id
    AND site.status IN ('preparing', 'active')
    AND site.deleted_at IS NULL;

  SELECT EXISTS(
    SELECT 1
    FROM public.site_template_assignments assignment
    WHERE assignment.site_id = NEW.site_id
      AND assignment.tenant_id = NEW.tenant_id
      AND assignment.status = 'active'
      AND assignment.schema_key = NEW.schema_key
      AND assignment.schema_version = NEW.schema_version
  ) INTO compatible_assignment;

  IF expected_tenant IS NULL
    OR expected_tenant <> NEW.tenant_id
    OR NOT (
      (
        site_industry = 'restaurant'
        AND NEW.schema_key IN ('restaurant.v1', 'restaurant.v2')
        AND (
          (NEW.schema_key = 'restaurant.v1' AND NEW.schema_version = 1)
          OR (NEW.schema_key = 'restaurant.v2' AND NEW.schema_version = 2)
        )
        AND compatible_assignment
      )
      OR (
        site_industry = 'gym'
        AND NEW.schema_key = 'gym.v1'
        AND NEW.schema_version = 1
        AND (
          compatible_assignment
          OR NOT EXISTS(
            SELECT 1 FROM public.site_template_assignments assignment
            WHERE assignment.site_id = NEW.site_id
              AND assignment.status = 'active'
          )
        )
      )
    )
  THEN
    RAISE EXCEPTION 'draft site, industry or schema mismatch'
      USING ERRCODE = '23514';
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
  ) OR EXISTS(
    SELECT 1 FROM public.site_content_drafts draft
    WHERE draft.site_id=NEW.id
      AND NOT (
        (NEW.industry_key='restaurant' AND (
          (draft.schema_key='restaurant.v1' AND draft.schema_version=1)
          OR (draft.schema_key='restaurant.v2' AND draft.schema_version=2)
        ))
        OR (NEW.industry_key='gym'
          AND draft.schema_key='gym.v1' AND draft.schema_version=1)
      )
  ) THEN
    RAISE EXCEPTION 'site industry incompatible with assignment or draft'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$function$;

ALTER TABLE public.content_media_references
  DROP CONSTRAINT content_media_field_valid;
ALTER TABLE public.content_media_references
  ADD CONSTRAINT content_media_field_valid CHECK (
    field_path IN ('identity.logo', 'hero.media')
    OR field_path ~ '^menu\.items\.[0-9]+\.media$'
    OR field_path ~ '^classes\.[0-9]+\.media$'
    OR field_path ~ '^trainers\.[0-9]+\.media$'
    OR field_path ~ '^facilities\.[0-9]+\.media$'
    OR field_path ~ '^gallery\.[0-9]+\.media$'
  );

CREATE OR REPLACE FUNCTION app_private.enforce_content_media_reference()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $function$
DECLARE
  owner_tenant uuid;
  owner_site uuid;
  owner_schema text;
  owner_schema_version integer;
  asset_status text;
  asset_archived_at timestamptz;
  field_allowed boolean;
BEGIN
  IF NEW.owner_kind='draft' THEN
    SELECT tenant_id,site_id,schema_key,schema_version
      INTO owner_tenant,owner_site,owner_schema,owner_schema_version
    FROM public.site_content_drafts WHERE id=NEW.draft_id;
  ELSE
    SELECT tenant_id,site_id,schema_key,schema_version
      INTO owner_tenant,owner_site,owner_schema,owner_schema_version
    FROM public.site_content_publications WHERE id=NEW.publication_id;
  END IF;

  field_allowed := CASE
    WHEN owner_schema='restaurant.v2' AND owner_schema_version=2 THEN
      NEW.field_path='hero.media'
      OR NEW.field_path ~ '^menu\.items\.[0-9]+\.media$'
    WHEN NEW.owner_kind='draft'
      AND owner_schema='gym.v1' AND owner_schema_version=1 THEN
      NEW.field_path IN ('identity.logo','hero.media')
      OR NEW.field_path ~ '^classes\.[0-9]+\.media$'
      OR NEW.field_path ~ '^trainers\.[0-9]+\.media$'
      OR NEW.field_path ~ '^facilities\.[0-9]+\.media$'
      OR NEW.field_path ~ '^gallery\.[0-9]+\.media$'
    ELSE false
  END;

  SELECT status,archived_at INTO asset_status,asset_archived_at
  FROM public.media_assets
  WHERE id=NEW.asset_id
    AND tenant_id=NEW.tenant_id
    AND site_id=NEW.site_id;
  IF owner_tenant IS NULL
    OR owner_tenant <> NEW.tenant_id
    OR owner_site <> NEW.site_id
    OR asset_status IS NULL
    OR NOT field_allowed
  THEN
    RAISE EXCEPTION 'content media ownership, schema or field mismatch'
      USING ERRCODE='23514';
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
