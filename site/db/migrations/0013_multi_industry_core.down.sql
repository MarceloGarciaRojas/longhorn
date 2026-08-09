DROP FUNCTION app_private.resolve_public_site(text,text);
CREATE FUNCTION app_private.resolve_public_site(
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
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
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
REVOKE ALL ON FUNCTION app_private.resolve_public_site(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.resolve_public_site(text,text) TO nexi_app;

DROP POLICY templates_client_catalog_select ON public.templates;
CREATE POLICY templates_client_catalog_select ON public.templates FOR SELECT
  USING (
    status='active' AND industry_key='restaurant'
    AND app_private.current_actor_is_active_member()
  );

CREATE OR REPLACE FUNCTION app_private.protect_client_template_assignment_update()
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

CREATE OR REPLACE FUNCTION app_private.protect_client_site_operation_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $function$
BEGIN
  IF current_user <> 'nexi_app' OR app_private.current_actor_is_nexi_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.display_name IS DISTINCT FROM OLD.display_name
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.version <> OLD.version+1
    OR NOT (
      (
        NEW.current_publication_id IS NOT DISTINCT FROM OLD.current_publication_id
        AND (
          (OLD.status IN ('preparing','active','suspended')
            AND NEW.status='deletion_requested')
          OR
          (OLD.status='deletion_requested'
            AND NEW.status IN ('preparing','active','suspended'))
        )
      )
      OR
      (
        NEW.status=OLD.status
        AND OLD.status='active'
        AND NEW.current_publication_id IS DISTINCT FROM OLD.current_publication_id
      )
    )
  THEN
    RAISE EXCEPTION 'client site operation fields are restricted'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER templates_industry_consistency ON public.templates;
DROP FUNCTION app_private.enforce_template_industry_consistency();

DROP TRIGGER sites_industry_consistency ON public.sites;
DROP FUNCTION app_private.enforce_site_industry_consistency();

CREATE OR REPLACE FUNCTION app_private.enforce_assignment_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $function$
DECLARE
  expected_tenant uuid;
  version_status text;
  version_schema text;
  minimum_version integer;
  maximum_version integer;
BEGIN
  SELECT tenant_id INTO expected_tenant
  FROM public.sites WHERE id=NEW.site_id AND deleted_at IS NULL;
  IF expected_tenant IS NULL OR expected_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'site tenant mismatch' USING ERRCODE='23514';
  END IF;
  SELECT status,content_schema_key,minimum_schema_version,maximum_schema_version
    INTO version_status,version_schema,minimum_version,maximum_version
  FROM public.template_versions WHERE id=NEW.template_version_id;
  IF version_status IS NULL
    OR (TG_OP='INSERT' AND version_status <> 'active')
    OR (TG_OP='UPDATE'
      AND NEW.template_version_id IS DISTINCT FROM OLD.template_version_id
      AND version_status <> 'active')
    OR version_status='retired'
    OR version_schema <> NEW.schema_key
    OR NEW.schema_version NOT BETWEEN minimum_version AND maximum_version
  THEN
    RAISE EXCEPTION 'template assignment incompatible' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$function$;

ALTER TABLE public.sites
  DROP CONSTRAINT sites_industry_valid,
  DROP COLUMN industry_key;

ALTER TABLE public.templates
  DROP CONSTRAINT templates_industry_valid;
ALTER TABLE public.templates
  ADD CONSTRAINT templates_industry_valid CHECK (industry_key='restaurant');
