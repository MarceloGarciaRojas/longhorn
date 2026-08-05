DELETE FROM public.platform_audit_events
WHERE action IN (
  'template_assigned','template_version_changed','content_initialized',
  'content_draft_saved','content_edit_conflict','content_previewed',
  'content_published','content_restored','content_publish_rejected',
  'content_access_denied','renderer_unknown','public_resolution_failed'
);

DROP FUNCTION IF EXISTS app_private.content_record_public_event(uuid,text,text,text);

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
    'conversation_priority_changed','support_message_sent','operation_access_denied'
  )
);
ALTER TABLE public.platform_audit_events DROP CONSTRAINT platform_audit_resource_type_valid;
ALTER TABLE public.platform_audit_events ADD CONSTRAINT platform_audit_resource_type_valid CHECK (
  resource_type IN (
    'tenant','invitation','membership','admin_route','client_route',
    'user_profile','tenant_profile','site','deletion_request','domain_request',
    'domain','conversation','message','outbox'
  )
);

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
    'support_message_sent','operation_access_denied'
  ) OR requested_resource_type NOT IN (
    'client_route','user_profile','tenant_profile','site','deletion_request',
    'domain_request','conversation','message'
  ) THEN RAISE EXCEPTION 'invalid client audit event' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.platform_audit_events(
    actor_user_id,tenant_id,action,resource_type,resource_id,outcome,
    correlation_id,previous_state,new_state,metadata
  ) VALUES (
    requested_actor_user_id,requested_tenant_id,requested_action,
    requested_resource_type,requested_resource_id,
    CASE WHEN requested_action='operation_access_denied' THEN 'blocked' ELSE 'succeeded' END,
    requested_correlation_id,requested_previous_state,requested_new_state,
    COALESCE(requested_metadata,'{}'::jsonb)
  ) RETURNING id INTO created_event_id;
  RETURN created_event_id;
END
$function$;

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
    'conversation_priority_changed','support_message_sent',
    'operation_access_denied'
  ) THEN RAISE EXCEPTION 'invalid operation event' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.platform_audit_events(
    actor_user_id,tenant_id,action,resource_type,resource_id,outcome,
    correlation_id,previous_state,new_state,metadata
  ) VALUES (
    nullif(current_setting('app.current_user_id',true),'')::uuid,
    requested_tenant_id,requested_action,requested_resource_type,
    requested_resource_id,
    CASE WHEN requested_action='operation_access_denied' THEN 'blocked' ELSE 'succeeded' END,
    requested_correlation_id,requested_previous_state,requested_new_state,
    COALESCE(requested_metadata,'{}'::jsonb)
  ) RETURNING id INTO created_event_id;
  RETURN created_event_id;
END
$function$;

REVOKE EXECUTE ON FUNCTION app_private.resolve_public_site(text,text) FROM nexi_app;
DROP FUNCTION app_private.resolve_public_site(text,text);

DROP TRIGGER IF EXISTS sites_current_publication_consistency ON public.sites;
DROP FUNCTION IF EXISTS app_private.enforce_current_publication_pointer();
DROP TRIGGER IF EXISTS site_content_publications_immutable
  ON public.site_content_publications;
DROP FUNCTION IF EXISTS app_private.prevent_publication_changes();
DROP TRIGGER IF EXISTS site_content_publication_consistency
  ON public.site_content_publications;
DROP FUNCTION IF EXISTS app_private.enforce_publication_consistency();
DROP TRIGGER IF EXISTS site_content_draft_consistency ON public.site_content_drafts;
DROP FUNCTION IF EXISTS app_private.enforce_content_draft_consistency();
DROP TRIGGER IF EXISTS site_template_assignment_consistency
  ON public.site_template_assignments;
DROP FUNCTION IF EXISTS app_private.enforce_assignment_consistency();

CREATE OR REPLACE FUNCTION app_private.protect_client_site_operation_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $function$
BEGIN
  IF app_private.current_actor_is_nexi_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.display_name IS DISTINCT FROM OLD.display_name
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.version <> OLD.version + 1
    OR NOT (
      (OLD.status IN ('preparing','active','suspended')
        AND NEW.status = 'deletion_requested')
      OR
      (OLD.status = 'deletion_requested'
        AND NEW.status IN ('preparing','active','suspended'))
    )
  THEN
    RAISE EXCEPTION 'client site operation fields are restricted'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE UPDATE(current_publication_id) ON public.sites FROM nexi_app;
ALTER TABLE public.sites DROP COLUMN current_publication_id;
DROP TABLE public.site_content_drafts;
DROP TABLE public.site_content_publications;
DROP POLICY IF EXISTS template_versions_client_assigned_select
  ON public.template_versions;
DROP POLICY IF EXISTS templates_client_assigned_select
  ON public.templates;
DROP TABLE public.site_template_assignments;
DROP TABLE public.template_versions;
DROP TABLE public.templates;
