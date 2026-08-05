UPDATE public.auth_audit_events
SET event_type = CASE event_type
  WHEN 'mfa_succeeded' THEN 'login_succeeded'
  WHEN 'password_reset_completed' THEN 'password_reset_completed'
  ELSE 'login_failed'
END
WHERE event_type IN (
  'session_revoked',
  'mfa_required',
  'mfa_succeeded',
  'access_denied'
);

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

ALTER TABLE public.auth_rate_limits
DROP CONSTRAINT auth_rate_limits_scope_valid;

DELETE FROM public.auth_rate_limits
WHERE scope IN (
  'recovery_verify_ip',
  'password_reset_ip',
  'tenant_selection'
);

ALTER TABLE public.auth_rate_limits
ADD CONSTRAINT auth_rate_limits_scope_valid CHECK (
  scope IN ('login_ip', 'login_identity', 'recovery_ip', 'recovery_identity')
);

REVOKE ALL ON FUNCTION app_private.consume_auth_recovery_grant(bytea) FROM nexi_app;
REVOKE ALL ON FUNCTION app_private.register_auth_recovery_grant(
  bytea, timestamptz
) FROM nexi_app;
DROP FUNCTION IF EXISTS app_private.consume_auth_recovery_grant(bytea);
DROP FUNCTION IF EXISTS app_private.register_auth_recovery_grant(
  bytea, timestamptz
);
DROP TABLE IF EXISTS public.auth_recovery_grants;

DROP FUNCTION app_private.read_auth_session(bytea);

CREATE FUNCTION app_private.read_auth_session(requested_token_hash bytea)
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  email text,
  display_name text,
  audience text,
  assurance_level text,
  active_tenant_id uuid,
  active_tenant_name text,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    session.id,
    session.user_id,
    account.email,
    account.display_name,
    session.audience,
    session.assurance_level,
    session.active_tenant_id,
    tenant.display_name,
    session.expires_at
  FROM public.auth_sessions AS session
  JOIN public.users AS account ON account.id = session.user_id
  LEFT JOIN public.tenants AS tenant ON tenant.id = session.active_tenant_id
  WHERE session.token_hash = requested_token_hash
    AND session.revoked_at IS NULL
    AND session.expires_at > transaction_timestamp()
    AND account.status = 'active'
    AND account.deleted_at IS NULL
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION app_private.read_auth_session(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.read_auth_session(bytea) TO nexi_app;

DROP FUNCTION app_private.create_auth_session(
  bytea, uuid, text, text, text, text, uuid, timestamptz, bytea, bytea
);

CREATE FUNCTION app_private.create_auth_session(
  requested_token_hash bytea,
  requested_user_id uuid,
  requested_audience text,
  requested_assurance_level text,
  requested_tenant_id uuid,
  requested_expires_at timestamptz,
  requested_user_agent_hash bytea,
  requested_ip_hash bytea
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  INSERT INTO public.auth_sessions (
    token_hash,
    user_id,
    audience,
    assurance_level,
    active_tenant_id,
    expires_at,
    user_agent_hash,
    ip_hash
  )
  VALUES (
    requested_token_hash,
    requested_user_id,
    requested_audience,
    requested_assurance_level,
    requested_tenant_id,
    requested_expires_at,
    requested_user_agent_hash,
    requested_ip_hash
  )
  RETURNING id
$function$;

REVOKE ALL ON FUNCTION app_private.create_auth_session(
  bytea, uuid, text, text, uuid, timestamptz, bytea, bytea
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.create_auth_session(
  bytea, uuid, text, text, uuid, timestamptz, bytea, bytea
) TO nexi_app;

ALTER TABLE public.auth_sessions
DROP CONSTRAINT auth_sessions_identity_subject_valid,
DROP CONSTRAINT auth_sessions_identity_provider_valid,
DROP COLUMN identity_subject,
DROP COLUMN identity_provider;
