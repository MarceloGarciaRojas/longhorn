ALTER TABLE public.auth_audit_events
DROP CONSTRAINT auth_audit_event_type_valid;

ALTER TABLE public.auth_audit_events
ADD CONSTRAINT auth_audit_event_type_valid CHECK (
  event_type IN (
    'login_succeeded',
    'login_failed',
    'login_rate_limited',
    'logout',
    'session_rejected',
    'tenant_selected',
    'password_recovery_requested',
    'password_reset_completed'
  )
);

CREATE FUNCTION app_private.revoke_all_auth_sessions(
  requested_user_id uuid,
  requested_reason text
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  WITH revoked AS (
    UPDATE public.auth_sessions
    SET
      revoked_at = transaction_timestamp(),
      revoke_reason = requested_reason
    WHERE user_id = requested_user_id
      AND revoked_at IS NULL
    RETURNING 1
  )
  SELECT count(*)::integer FROM revoked
$function$;

REVOKE ALL ON FUNCTION app_private.revoke_all_auth_sessions(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.revoke_all_auth_sessions(uuid, text) TO nexi_app;
