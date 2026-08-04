CREATE TABLE public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  industry_key text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT templates_key_valid CHECK (key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT templates_name_valid CHECK (length(btrim(display_name)) BETWEEN 2 AND 120),
  CONSTRAINT templates_industry_valid CHECK (industry_key = 'restaurant'),
  CONSTRAINT templates_status_valid CHECK (
    status IN ('draft', 'active', 'deprecated', 'retired')
  ),
  CONSTRAINT templates_description_valid CHECK (
    length(btrim(description)) BETWEEN 10 AND 500
  )
);
CREATE TRIGGER templates_set_updated_at BEFORE UPDATE
  ON public.templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.templates(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  renderer_key text NOT NULL,
  content_schema_key text NOT NULL,
  minimum_schema_version integer NOT NULL,
  maximum_schema_version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  released_at timestamptz,
  deprecated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT template_versions_number_unique UNIQUE(template_id, version),
  CONSTRAINT template_versions_number_valid CHECK (version > 0),
  CONSTRAINT template_versions_renderer_valid CHECK (
    renderer_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  CONSTRAINT template_versions_schema_key_valid CHECK (
    content_schema_key ~ '^[a-z][a-z0-9_-]*\.[a-z0-9_-]+$'
  ),
  CONSTRAINT template_versions_schema_range_valid CHECK (
    minimum_schema_version > 0
    AND maximum_schema_version >= minimum_schema_version
  ),
  CONSTRAINT template_versions_status_valid CHECK (
    status IN ('draft', 'active', 'deprecated', 'retired')
  )
);
CREATE INDEX template_versions_lookup_idx
  ON public.template_versions(template_id, status, version DESC);
CREATE TRIGGER template_versions_set_updated_at BEFORE UPDATE
  ON public.template_versions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.site_template_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  template_version_id uuid NOT NULL
    REFERENCES public.template_versions(id) ON DELETE RESTRICT,
  schema_key text NOT NULL,
  schema_version integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  assigned_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT site_template_assignment_site_unique UNIQUE(site_id),
  CONSTRAINT site_template_assignment_idempotency_unique UNIQUE(idempotency_key),
  CONSTRAINT site_template_assignment_schema_valid CHECK (
    schema_key ~ '^[a-z][a-z0-9_-]*\.[a-z0-9_-]+$' AND schema_version > 0
  ),
  CONSTRAINT site_template_assignment_status_valid CHECK (
    status IN ('active', 'detached')
  ),
  CONSTRAINT site_template_assignment_version_valid CHECK (version > 0)
);
CREATE INDEX site_template_assignments_tenant_idx
  ON public.site_template_assignments(tenant_id, site_id);
CREATE TRIGGER site_template_assignments_set_updated_at BEFORE UPDATE
  ON public.site_template_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.site_content_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  schema_key text NOT NULL,
  schema_version integer NOT NULL,
  content jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  based_on_publication_id uuid,
  created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  last_idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT site_content_draft_site_unique UNIQUE(site_id),
  CONSTRAINT site_content_draft_revision_valid CHECK (revision > 0),
  CONSTRAINT site_content_draft_schema_valid CHECK (
    schema_key = 'restaurant.v1' AND schema_version = 1
  ),
  CONSTRAINT site_content_draft_document_valid CHECK (
    jsonb_typeof(content) = 'object'
    AND octet_length(content::text) <= 65536
    AND lower(content::text) !~ '<[[:space:]]*(script|iframe|object|embed)'
    AND lower(content::text) NOT LIKE '%javascript:%'
  )
);
CREATE INDEX site_content_drafts_tenant_idx
  ON public.site_content_drafts(tenant_id, site_id);
CREATE TRIGGER site_content_drafts_set_updated_at BEFORE UPDATE
  ON public.site_content_drafts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.site_content_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  template_version_id uuid NOT NULL
    REFERENCES public.template_versions(id) ON DELETE RESTRICT,
  schema_key text NOT NULL,
  schema_version integer NOT NULL,
  content_snapshot jsonb NOT NULL,
  publication_number integer NOT NULL,
  published_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  restored_from_publication_id uuid
    REFERENCES public.site_content_publications(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT site_content_publication_number_unique UNIQUE(site_id, publication_number),
  CONSTRAINT site_content_publication_idempotency_unique UNIQUE(
    tenant_id, published_by_user_id, idempotency_key
  ),
  CONSTRAINT site_content_publication_number_valid CHECK (publication_number > 0),
  CONSTRAINT site_content_publication_schema_valid CHECK (
    schema_key = 'restaurant.v1' AND schema_version = 1
  ),
  CONSTRAINT site_content_publication_document_valid CHECK (
    jsonb_typeof(content_snapshot) = 'object'
    AND octet_length(content_snapshot::text) <= 65536
    AND lower(content_snapshot::text) !~ '<[[:space:]]*(script|iframe|object|embed)'
    AND lower(content_snapshot::text) NOT LIKE '%javascript:%'
  )
);
CREATE INDEX site_content_publications_history_idx
  ON public.site_content_publications(site_id, publication_number DESC);

ALTER TABLE public.site_content_drafts
  ADD CONSTRAINT site_content_draft_base_publication_fk
  FOREIGN KEY(based_on_publication_id)
  REFERENCES public.site_content_publications(id) ON DELETE RESTRICT;

ALTER TABLE public.sites
  ADD COLUMN current_publication_id uuid
  REFERENCES public.site_content_publications(id) ON DELETE RESTRICT;

CREATE FUNCTION app_private.enforce_assignment_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE
  expected_tenant uuid;
  version_status text;
  version_schema text;
  minimum_version integer;
  maximum_version integer;
BEGIN
  SELECT tenant_id INTO expected_tenant
  FROM public.sites WHERE id = NEW.site_id AND deleted_at IS NULL;
  IF expected_tenant IS NULL OR expected_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'site tenant mismatch' USING ERRCODE = '23514';
  END IF;
  SELECT status, content_schema_key, minimum_schema_version, maximum_schema_version
    INTO version_status, version_schema, minimum_version, maximum_version
  FROM public.template_versions WHERE id = NEW.template_version_id;
  IF version_status IS NULL
    OR (TG_OP = 'INSERT' AND version_status <> 'active')
    OR (TG_OP = 'UPDATE'
      AND NEW.template_version_id IS DISTINCT FROM OLD.template_version_id
      AND version_status <> 'active')
    OR version_status = 'retired'
    OR version_schema <> NEW.schema_key
    OR NEW.schema_version NOT BETWEEN minimum_version AND maximum_version
  THEN
    RAISE EXCEPTION 'template assignment incompatible' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER site_template_assignment_consistency
  BEFORE INSERT OR UPDATE ON public.site_template_assignments
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_assignment_consistency();

CREATE FUNCTION app_private.enforce_content_draft_consistency()
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
CREATE TRIGGER site_content_draft_consistency
  BEFORE INSERT OR UPDATE ON public.site_content_drafts
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_content_draft_consistency();

CREATE FUNCTION app_private.enforce_publication_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE expected_tenant uuid;
BEGIN
  SELECT site.tenant_id INTO expected_tenant
  FROM public.sites site
  JOIN public.tenants tenant ON tenant.id = site.tenant_id
  JOIN public.site_template_assignments assignment
    ON assignment.site_id = site.id
   AND assignment.tenant_id = site.tenant_id
   AND assignment.status = 'active'
   AND assignment.template_version_id = NEW.template_version_id
   AND assignment.schema_key = NEW.schema_key
   AND assignment.schema_version = NEW.schema_version
  WHERE site.id = NEW.site_id
    AND site.status = 'active'
    AND site.deleted_at IS NULL
    AND tenant.status = 'active'
    AND tenant.deleted_at IS NULL;
  IF expected_tenant IS NULL OR expected_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'publication site mismatch or unavailable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER site_content_publication_consistency
  BEFORE INSERT ON public.site_content_publications
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_publication_consistency();

CREATE FUNCTION app_private.prevent_publication_changes()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'content publications are immutable' USING ERRCODE = '42501';
END
$function$;
CREATE TRIGGER site_content_publications_immutable
  BEFORE UPDATE OR DELETE ON public.site_content_publications
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_publication_changes();

CREATE FUNCTION app_private.enforce_current_publication_pointer()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE pointer_valid boolean;
BEGIN
  IF NEW.current_publication_id IS NOT DISTINCT FROM OLD.current_publication_id THEN
    RETURN NEW;
  END IF;
  IF NEW.current_publication_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM public.site_content_publications publication
    WHERE publication.id = NEW.current_publication_id
      AND publication.site_id = NEW.id
      AND publication.tenant_id = NEW.tenant_id
  ) INTO pointer_valid;
  IF NOT pointer_valid THEN
    RAISE EXCEPTION 'invalid current publication' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER sites_current_publication_consistency
  BEFORE UPDATE OF current_publication_id ON public.sites
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_current_publication_pointer();

CREATE OR REPLACE FUNCTION app_private.protect_client_site_operation_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $function$
BEGIN
  IF current_user <> 'nexi_app' OR app_private.current_actor_is_nexi_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.display_name IS DISTINCT FROM OLD.display_name
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.version <> OLD.version + 1
    OR NOT (
      (
        NEW.current_publication_id IS NOT DISTINCT FROM OLD.current_publication_id
        AND (
          (OLD.status IN ('preparing','active','suspended')
            AND NEW.status = 'deletion_requested')
          OR
          (OLD.status = 'deletion_requested'
            AND NEW.status IN ('preparing','active','suspended'))
        )
      )
      OR
      (
        NEW.status = OLD.status
        AND OLD.status = 'active'
        AND NEW.current_publication_id IS DISTINCT FROM OLD.current_publication_id
      )
    )
  THEN
    RAISE EXCEPTION 'client site operation fields are restricted'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;

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
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  WITH candidate AS (
    SELECT site.id, site.slug, site.status AS site_status,
      site.current_publication_id, site.tenant_id, tenant.status AS tenant_status
    FROM public.sites site
    JOIN public.tenants tenant ON tenant.id = site.tenant_id
    LEFT JOIN public.site_domains requested_domain
      ON requested_domain.site_id = site.id
     AND requested_domain.tenant_id = site.tenant_id
     AND requested_domain.hostname = lower(btrim(requested_hostname))
     AND requested_domain.status = 'active'
     AND requested_domain.verification_status = 'verified'
    WHERE site.deleted_at IS NULL
      AND tenant.deleted_at IS NULL
      AND (
        (requested_hostname IS NOT NULL AND requested_domain.id IS NOT NULL)
        OR
        (
          requested_hostname IS NULL
          AND requested_slug IS NOT NULL
          AND site.slug = lower(btrim(requested_slug))
          AND (
            SELECT count(*) FROM public.sites duplicate
            WHERE duplicate.slug = lower(btrim(requested_slug))
              AND duplicate.deleted_at IS NULL
          ) = 1
        )
      )
    LIMIT 1
  )
  SELECT candidate.id, candidate.slug,
    CASE
      WHEN candidate.tenant_status = 'active'
       AND candidate.site_status = 'active'
       AND publication.id IS NOT NULL
       AND assignment.status = 'active'
       AND version.status IN ('active','deprecated')
      THEN 'published'
      WHEN candidate.tenant_status = 'active'
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
      WHEN candidate.tenant_status = 'active'
       AND candidate.site_status = 'active'
       AND assignment.status = 'active'
       AND version.status IN ('active','deprecated')
      THEN publication.content_snapshot
    END
  FROM candidate
  LEFT JOIN public.site_content_publications publication
    ON publication.id = candidate.current_publication_id
   AND publication.site_id = candidate.id
   AND publication.tenant_id = candidate.tenant_id
  LEFT JOIN public.site_template_assignments assignment
    ON assignment.site_id = candidate.id
   AND assignment.tenant_id = candidate.tenant_id
   AND assignment.template_version_id = publication.template_version_id
  LEFT JOIN public.template_versions version
    ON version.id = publication.template_version_id
  LEFT JOIN LATERAL (
    SELECT domain.hostname
    FROM public.site_domains domain
    WHERE domain.site_id = candidate.id
      AND domain.tenant_id = candidate.tenant_id
      AND domain.is_primary
      AND domain.status = 'active'
      AND domain.verification_status = 'verified'
    ORDER BY domain.created_at DESC
    LIMIT 1
  ) primary_domain ON true
$function$;

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_template_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_content_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_content_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY templates_admin_all ON public.templates FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY templates_client_assigned_select ON public.templates FOR SELECT
  USING (
    app_private.current_actor_is_active_member()
    AND EXISTS (
      SELECT 1 FROM public.template_versions version
      JOIN public.site_template_assignments assignment
        ON assignment.template_version_id = version.id
      WHERE version.template_id = templates.id
        AND assignment.tenant_id = app_context.current_tenant_id()
        AND assignment.status = 'active'
    )
  );
CREATE POLICY template_versions_admin_all ON public.template_versions FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY template_versions_client_assigned_select
  ON public.template_versions FOR SELECT
  USING (
    app_private.current_actor_is_active_member()
    AND EXISTS (
      SELECT 1 FROM public.site_template_assignments assignment
      WHERE assignment.template_version_id = template_versions.id
        AND assignment.tenant_id = app_context.current_tenant_id()
        AND assignment.status = 'active'
    )
  );
CREATE POLICY template_assignments_admin_all
  ON public.site_template_assignments FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY template_assignments_client_select
  ON public.site_template_assignments FOR SELECT
  USING (
    tenant_id = app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY content_drafts_admin_all ON public.site_content_drafts FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY content_drafts_client_select ON public.site_content_drafts FOR SELECT
  USING (
    tenant_id = app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY content_drafts_client_insert ON public.site_content_drafts FOR INSERT
  WITH CHECK (
    tenant_id = app_context.current_tenant_id()
    AND created_by_user_id = app_context.current_user_id()
    AND updated_by_user_id = app_context.current_user_id()
    AND app_private.current_actor_is_active_member()
    AND EXISTS (
      SELECT 1 FROM public.sites site
      WHERE site.id = site_content_drafts.site_id
        AND site.tenant_id = app_context.current_tenant_id()
        AND site.status IN ('preparing','active')
        AND site.deleted_at IS NULL
    )
  );
CREATE POLICY content_drafts_client_update ON public.site_content_drafts FOR UPDATE
  USING (
    tenant_id = app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  )
  WITH CHECK (
    tenant_id = app_context.current_tenant_id()
    AND updated_by_user_id = app_context.current_user_id()
    AND app_private.current_actor_is_active_member()
    AND EXISTS (
      SELECT 1 FROM public.sites site
      WHERE site.id = site_content_drafts.site_id
        AND site.tenant_id = app_context.current_tenant_id()
        AND site.status IN ('preparing','active')
        AND site.deleted_at IS NULL
    )
  );
CREATE POLICY content_publications_admin_all
  ON public.site_content_publications FOR ALL
  USING (app_private.current_actor_is_nexi_admin())
  WITH CHECK (app_private.current_actor_is_nexi_admin());
CREATE POLICY content_publications_client_select
  ON public.site_content_publications FOR SELECT
  USING (
    tenant_id = app_context.current_tenant_id()
    AND app_private.current_actor_is_active_member()
  );
CREATE POLICY content_publications_client_insert
  ON public.site_content_publications FOR INSERT
  WITH CHECK (
    tenant_id = app_context.current_tenant_id()
    AND published_by_user_id = app_context.current_user_id()
    AND app_private.current_actor_is_active_member()
    AND EXISTS (
      SELECT 1 FROM public.sites site
      WHERE site.id = site_content_publications.site_id
        AND site.tenant_id = app_context.current_tenant_id()
        AND site.status = 'active'
        AND site.deleted_at IS NULL
    )
  );

REVOKE ALL ON TABLE public.templates, public.template_versions,
  public.site_template_assignments, public.site_content_drafts,
  public.site_content_publications FROM PUBLIC, nexi_app;
GRANT SELECT, INSERT, UPDATE ON public.templates TO nexi_app;
GRANT SELECT, INSERT, UPDATE ON public.template_versions TO nexi_app;
GRANT SELECT, INSERT, UPDATE ON public.site_template_assignments TO nexi_app;
GRANT SELECT, INSERT, UPDATE ON public.site_content_drafts TO nexi_app;
GRANT SELECT, INSERT ON public.site_content_publications TO nexi_app;
GRANT UPDATE(current_publication_id, version) ON public.sites TO nexi_app;
REVOKE ALL ON FUNCTION app_private.resolve_public_site(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.resolve_public_site(text,text) TO nexi_app;

CREATE OR REPLACE FUNCTION app_private.operation_record_admin_event(
  requested_tenant_id uuid, requested_action text, requested_resource_type text,
  requested_resource_id text, requested_correlation_id text,
  requested_previous_state jsonb, requested_new_state jsonb,
  requested_metadata jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE created_event_id bigint;
BEGIN
  IF NOT app_private.current_actor_is_nexi_admin() THEN
    RAISE EXCEPTION 'admin access denied' USING ERRCODE='42501';
  END IF;
  IF requested_action NOT IN (
    'site_created','site_updated','subdomain_assigned','deletion_approved',
    'deletion_rejected','deletion_canceled','site_archived','domain_status_changed',
    'domain_registered','conversation_closed','conversation_reopened',
    'conversation_priority_changed','support_message_sent','operation_access_denied',
    'template_assigned','template_version_changed','content_initialized',
    'renderer_unknown','content_access_denied'
  ) THEN RAISE EXCEPTION 'invalid operation event' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.platform_audit_events(
    actor_user_id,tenant_id,action,resource_type,resource_id,outcome,
    correlation_id,previous_state,new_state,metadata
  ) VALUES (
    nullif(current_setting('app.current_user_id',true),'')::uuid,
    requested_tenant_id,requested_action,requested_resource_type,
    requested_resource_id,
    CASE WHEN requested_action IN ('operation_access_denied','content_access_denied')
      THEN 'blocked' ELSE 'succeeded' END,
    requested_correlation_id,requested_previous_state,requested_new_state,
    COALESCE(requested_metadata,'{}'::jsonb)
  ) RETURNING id INTO created_event_id;
  RETURN created_event_id;
END
$function$;

CREATE OR REPLACE FUNCTION app_private.client_record_event(
  requested_session_id uuid, requested_actor_user_id uuid, requested_tenant_id uuid,
  requested_action text, requested_resource_type text, requested_resource_id text,
  requested_correlation_id text, requested_previous_state jsonb,
  requested_new_state jsonb, requested_metadata jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE created_event_id bigint;
BEGIN
  PERFORM app_private.require_client_session(
    requested_session_id, requested_actor_user_id, requested_tenant_id
  );
  IF requested_action NOT IN (
    'client_panel_accessed','personal_profile_updated','tenant_profile_updated',
    'deletion_requested','deletion_canceled','domain_requested',
    'conversation_created','conversation_closed','conversation_reopened',
    'support_message_sent','operation_access_denied','content_draft_saved',
    'content_edit_conflict','content_previewed','content_published',
    'content_restored','content_publish_rejected','content_access_denied'
  ) OR requested_resource_type NOT IN (
    'client_route','user_profile','tenant_profile','site','deletion_request',
    'domain_request','conversation','message','content_draft','content_publication',
    'public_site'
  ) THEN RAISE EXCEPTION 'invalid client audit event' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.platform_audit_events(
    actor_user_id,tenant_id,action,resource_type,resource_id,outcome,
    correlation_id,previous_state,new_state,metadata
  ) VALUES (
    requested_actor_user_id,requested_tenant_id,requested_action,
    requested_resource_type,requested_resource_id,
    CASE WHEN requested_action IN (
      'operation_access_denied','content_access_denied',
      'content_publish_rejected','content_edit_conflict'
    ) THEN 'blocked' ELSE 'succeeded' END,
    requested_correlation_id,requested_previous_state,requested_new_state,
    COALESCE(requested_metadata,'{}'::jsonb)
  ) RETURNING id INTO created_event_id;
  RETURN created_event_id;
END
$function$;

ALTER TABLE public.platform_audit_events DROP CONSTRAINT platform_audit_action_valid;
ALTER TABLE public.platform_audit_events ADD CONSTRAINT platform_audit_action_valid CHECK (
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
    'content_access_denied','renderer_unknown','public_resolution_failed'
  )
);
ALTER TABLE public.platform_audit_events DROP CONSTRAINT platform_audit_resource_type_valid;
ALTER TABLE public.platform_audit_events ADD CONSTRAINT platform_audit_resource_type_valid CHECK (
  resource_type IN (
    'tenant','invitation','membership','admin_route','client_route',
    'user_profile','tenant_profile','site','deletion_request','domain_request',
    'domain','conversation','message','outbox','template','template_version',
    'template_assignment','content_draft','content_publication','public_site'
  )
);

CREATE OR REPLACE FUNCTION app_private.content_record_public_event(
  requested_site_id uuid,
  requested_action text,
  requested_correlation_id text,
  requested_reason text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  target_tenant_id uuid;
  created_event_id bigint;
BEGIN
  IF requested_action NOT IN ('renderer_unknown','public_resolution_failed')
    OR requested_reason NOT IN ('renderer','content')
    OR length(requested_correlation_id) NOT BETWEEN 1 AND 200
  THEN
    RAISE EXCEPTION 'invalid public audit event' USING ERRCODE='22023';
  END IF;

  SELECT tenant_id INTO target_tenant_id
  FROM public.sites
  WHERE id=requested_site_id;

  IF target_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.platform_audit_events(
    actor_user_id,tenant_id,action,resource_type,resource_id,outcome,
    correlation_id,metadata
  ) VALUES (
    NULL,target_tenant_id,requested_action,'public_site',requested_site_id::text,
    'blocked',requested_correlation_id,
    jsonb_build_object('reason',requested_reason)
  ) RETURNING id INTO created_event_id;
  RETURN created_event_id;
END
$function$;

REVOKE ALL ON FUNCTION app_private.content_record_public_event(uuid,text,text,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.content_record_public_event(uuid,text,text,text)
  TO nexi_app;
