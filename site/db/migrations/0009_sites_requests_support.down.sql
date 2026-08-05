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
    'client_panel_accessed','personal_profile_updated','tenant_profile_updated'
  ) OR requested_resource_type NOT IN (
    'client_route','user_profile','tenant_profile'
  ) THEN RAISE EXCEPTION 'invalid client audit event' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.platform_audit_events(
    actor_user_id,tenant_id,action,resource_type,resource_id,outcome,
    correlation_id,previous_state,new_state,metadata
  ) VALUES (
    requested_actor_user_id,requested_tenant_id,requested_action,
    requested_resource_type,requested_resource_id,'succeeded',
    requested_correlation_id,requested_previous_state,requested_new_state,
    COALESCE(requested_metadata,'{}'::jsonb)
  ) RETURNING id INTO created_event_id;
  RETURN created_event_id;
END
$function$;

DELETE FROM public.platform_audit_events
WHERE action IN (
  'site_created','site_updated','subdomain_assigned','deletion_requested',
  'deletion_canceled','deletion_approved','deletion_rejected','site_archived',
  'domain_requested','domain_status_changed','domain_registered',
  'conversation_created','conversation_closed','conversation_reopened',
  'conversation_priority_changed','support_message_sent','operation_access_denied'
);
ALTER TABLE public.platform_audit_events DROP CONSTRAINT platform_audit_action_valid;
ALTER TABLE public.platform_audit_events ADD CONSTRAINT platform_audit_action_valid CHECK (
  action IN (
    'tenant_created','tenant_updated','tenant_activated','tenant_suspended',
    'tenant_reactivated','invitation_created','invitation_resent','invitation_failed',
    'invitation_revoked','invitation_accepted','membership_created',
    'membership_disabled','membership_reactivated','admin_access_denied',
    'client_panel_accessed','personal_profile_updated','tenant_profile_updated'
  )
);
ALTER TABLE public.platform_audit_events DROP CONSTRAINT platform_audit_resource_type_valid;
ALTER TABLE public.platform_audit_events ADD CONSTRAINT platform_audit_resource_type_valid CHECK (
  resource_type IN (
    'tenant','invitation','membership','admin_route','client_route',
    'user_profile','tenant_profile'
  )
);

DROP POLICY IF EXISTS audit_operations_admin_select ON public.platform_audit_events;
DROP POLICY IF EXISTS users_operations_admin_select ON public.users;
DROP POLICY IF EXISTS tenants_operations_admin_select ON public.tenants;
DROP POLICY IF EXISTS sites_client_deletion_update ON public.sites;
DROP POLICY sites_admin_all ON public.sites;
REVOKE SELECT ON public.platform_audit_events FROM nexi_app;
REVOKE INSERT, UPDATE ON public.sites FROM nexi_app;
DROP TRIGGER IF EXISTS sites_protect_client_operation_fields ON public.sites;
DROP FUNCTION IF EXISTS app_private.protect_client_site_operation_fields();
DROP TRIGGER IF EXISTS support_conversations_protect_admin_fields ON public.support_conversations;
DROP FUNCTION IF EXISTS app_private.protect_support_conversation_admin_fields();
DROP FUNCTION IF EXISTS app_private.operation_enqueue_notification(uuid,uuid,text,jsonb,text);
DROP TABLE public.notification_outbox;
DROP TABLE public.support_conversation_participants;
DROP TABLE public.support_messages;
DROP TABLE public.support_conversations;
DROP TABLE public.site_domains;
DROP TABLE public.site_domain_requests;
DROP TABLE public.site_deletion_requests;
DROP FUNCTION IF EXISTS app_private.prevent_support_message_changes();
DROP FUNCTION IF EXISTS app_private.enforce_support_consistency();
DROP FUNCTION IF EXISTS app_private.enforce_site_tenant_consistency();
DROP FUNCTION IF EXISTS app_private.operation_record_admin_event(uuid,text,text,text,text,jsonb,jsonb,jsonb);
DROP FUNCTION IF EXISTS app_private.notification_recipient_admin();
DROP FUNCTION IF EXISTS app_private.current_actor_is_nexi_admin();

ALTER TABLE public.sites DROP CONSTRAINT sites_status_valid;
UPDATE public.sites SET status = 'suspended' WHERE status IN ('deletion_requested','archived');
ALTER TABLE public.sites ADD CONSTRAINT sites_status_valid CHECK (
  status IN ('preparing','active','suspended')
);
ALTER TABLE public.sites DROP CONSTRAINT sites_version_valid;
DROP INDEX IF EXISTS public.sites_creation_idempotency_key_unique;
ALTER TABLE public.sites DROP COLUMN IF EXISTS creation_idempotency_key;
ALTER TABLE public.sites DROP COLUMN version;
