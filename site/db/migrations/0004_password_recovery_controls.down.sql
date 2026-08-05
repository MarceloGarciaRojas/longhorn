REVOKE ALL ON FUNCTION app_private.revoke_all_auth_sessions(uuid, text) FROM nexi_app;
DROP FUNCTION IF EXISTS app_private.revoke_all_auth_sessions(uuid, text);

UPDATE public.auth_audit_events
SET event_type = 'password_recovery_requested'
WHERE event_type = 'password_reset_completed';

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
    'password_recovery_requested'
  )
);
