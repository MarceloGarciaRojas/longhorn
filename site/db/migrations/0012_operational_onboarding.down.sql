DROP FUNCTION IF EXISTS app_private.onboarding_record_event(
  uuid,text,text,text,text,jsonb,jsonb,jsonb
);
DROP FUNCTION IF EXISTS app_private.onboarding_list_active_admins();
DROP FUNCTION IF EXISTS app_private.onboarding_submit_intake(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text
);

DELETE FROM public.notification_outbox
WHERE template_key='onboarding_update';
ALTER TABLE public.notification_outbox
  DROP CONSTRAINT notification_outbox_template_valid;
ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_template_valid CHECK (
    template_key='new_support_message'
  );
CREATE OR REPLACE FUNCTION app_private.operation_enqueue_notification(
  requested_tenant_id uuid,
  requested_recipient_user_id uuid,
  requested_template_key text,
  requested_payload jsonb,
  requested_deduplication_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
DECLARE created_id uuid;
BEGIN
  IF NOT app_private.current_actor_is_nexi_admin() THEN
    IF requested_tenant_id IS DISTINCT FROM app_context.current_tenant_id()
      OR NOT app_private.current_actor_is_active_member()
    THEN
      RAISE EXCEPTION 'notification enqueue denied' USING ERRCODE='42501';
    END IF;
  END IF;
  IF requested_template_key <> 'new_support_message'
    OR jsonb_typeof(requested_payload) <> 'object'
    OR requested_payload ?| ARRAY['body','token','cookie','password','secret']
    OR NOT (requested_payload ? 'path')
    OR length(requested_deduplication_key) NOT BETWEEN 10 AND 200
  THEN
    RAISE EXCEPTION 'invalid notification payload' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.notification_outbox(
    tenant_id,recipient_user_id,template_key,payload,deduplication_key
  ) VALUES(
    requested_tenant_id,requested_recipient_user_id,requested_template_key,
    requested_payload,requested_deduplication_key
  )
  ON CONFLICT(deduplication_key) DO NOTHING
  RETURNING id INTO created_id;
  IF created_id IS NULL THEN
    SELECT id INTO created_id FROM public.notification_outbox
    WHERE deduplication_key=requested_deduplication_key;
  END IF;
  RETURN created_id;
END
$function$;

DELETE FROM public.platform_audit_events
WHERE action LIKE 'onboarding_%';

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

DROP TRIGGER IF EXISTS onboarding_media_invalidates_approval
  ON public.content_media_references;
DROP TRIGGER IF EXISTS onboarding_template_invalidates_approval
  ON public.site_template_assignments;
DROP TRIGGER IF EXISTS onboarding_draft_invalidates_approval
  ON public.site_content_drafts;
DROP FUNCTION IF EXISTS app_private.invalidate_onboarding_approval();
DROP TRIGGER IF EXISTS onboarding_invitation_accepted
  ON public.tenant_invitations;
DROP FUNCTION IF EXISTS app_private.link_accepted_onboarding_invitation();

DROP POLICY IF EXISTS memberships_onboarding_admin_select
  ON public.tenant_memberships;
DROP POLICY IF EXISTS plans_onboarding_admin_select ON public.plans;
DROP POLICY IF EXISTS tenant_plan_assignments_onboarding_admin_all
  ON public.tenant_plan_assignments;
DROP POLICY IF EXISTS tenant_profiles_onboarding_admin_all
  ON public.tenant_profiles;
REVOKE INSERT,UPDATE ON public.tenant_plan_assignments FROM nexi_app;

DROP TABLE IF EXISTS public.onboarding_internal_notes;
DROP TABLE IF EXISTS public.onboarding_intake_internal_notes;
DROP TABLE IF EXISTS public.onboarding_state_history;
DROP TABLE IF EXISTS public.onboarding_client_approvals;
DROP TABLE IF EXISTS public.onboarding_checklist_items;
DROP TABLE IF EXISTS public.onboarding_answers;
ALTER TABLE public.onboarding_intake_requests
  DROP CONSTRAINT IF EXISTS onboarding_intake_case_fk;
DROP TABLE IF EXISTS public.onboarding_cases;
DROP TABLE IF EXISTS public.onboarding_intake_requests;
DROP FUNCTION IF EXISTS app_private.enforce_onboarding_tenant_consistency();

DELETE FROM public.auth_rate_limits WHERE scope='onboarding_public';
ALTER TABLE public.auth_rate_limits
  DROP CONSTRAINT auth_rate_limits_scope_valid;
ALTER TABLE public.auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_valid CHECK (
    scope IN (
      'login_ip', 'login_identity', 'recovery_ip', 'recovery_identity',
      'recovery_verify_ip', 'password_reset_ip', 'tenant_selection',
      'admin_mutation', 'invitation_acceptance', 'client_mutation'
    )
  );
