ALTER TABLE public.auth_rate_limits
DROP CONSTRAINT auth_rate_limits_scope_valid;

DELETE FROM public.auth_rate_limits
WHERE scope IN ('admin_mutation', 'invitation_acceptance');

ALTER TABLE public.auth_rate_limits
ADD CONSTRAINT auth_rate_limits_scope_valid CHECK (
  scope IN (
    'login_ip', 'login_identity', 'recovery_ip', 'recovery_identity',
    'recovery_verify_ip', 'password_reset_ip', 'tenant_selection'
  )
);

CREATE OR REPLACE FUNCTION app_private.revoke_sessions_on_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF TG_OP = 'DELETE'
    OR OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD.role IS DISTINCT FROM NEW.role
  THEN
    UPDATE public.auth_sessions
    SET
      revoked_at = COALESCE(revoked_at, transaction_timestamp()),
      revoke_reason = COALESCE(revoke_reason, 'membership_changed')
    WHERE user_id = OLD.user_id
      AND audience = 'client_admin'
      AND revoked_at IS NULL;
  END IF;
  RETURN NULL;
END
$function$;

DROP FUNCTION app_private.record_admin_access_denied(uuid, text, text, jsonb);
DROP FUNCTION app_private.admin_set_membership_status(uuid, uuid, uuid, text, text, text);
DROP FUNCTION app_private.accept_tenant_invitation(text, text, text, text, text, text);
DROP FUNCTION app_private.admin_revoke_invitation(uuid, uuid, uuid, text, text);
DROP FUNCTION app_private.admin_prepare_invitation_resend(uuid, uuid, uuid, timestamptz);
DROP FUNCTION app_private.admin_fail_invitation(uuid, uuid, uuid, text, text);
DROP FUNCTION app_private.admin_complete_invitation(uuid, uuid, uuid, text, timestamptz, text);
DROP FUNCTION app_private.admin_reserve_invitation(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz);
DROP FUNCTION app_private.admin_set_tenant_status(uuid, uuid, uuid, text, text, text);
DROP FUNCTION app_private.admin_update_tenant(uuid, uuid, uuid, timestamptz, text, text, text, text, text);
DROP FUNCTION app_private.admin_create_tenant(uuid, uuid, uuid, text, text, text, text, text, text);
DROP FUNCTION app_private.admin_list_audit_events(uuid, uuid, text, uuid, text, timestamptz, timestamptz, text, integer, integer);
DROP FUNCTION app_private.admin_list_invitations(uuid, uuid, uuid, text, integer, integer);
DROP FUNCTION app_private.admin_list_memberships(uuid, uuid, uuid);
DROP FUNCTION app_private.admin_get_tenant(uuid, uuid, uuid);
DROP FUNCTION app_private.admin_list_tenants(uuid, uuid, text, text, text, integer, integer);
DROP FUNCTION app_private.admin_dashboard(uuid, uuid);
DROP FUNCTION app_private.require_nexi_admin_session(uuid, uuid);

DROP TABLE public.platform_audit_events;
DROP TABLE public.platform_idempotency_keys;
DROP TABLE public.tenant_invitations;

UPDATE public.tenants
SET status = 'suspended'
WHERE status = 'draft';

ALTER TABLE public.tenants
DROP CONSTRAINT tenants_slug_not_reserved;

ALTER TABLE public.tenants
DROP CONSTRAINT tenants_status_valid;

ALTER TABLE public.tenants
ADD CONSTRAINT tenants_status_valid CHECK (
  status IN ('active', 'suspended', 'archived')
);
