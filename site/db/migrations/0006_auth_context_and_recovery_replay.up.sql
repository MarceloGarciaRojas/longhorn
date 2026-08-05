ALTER TABLE public.auth_sessions
ADD COLUMN identity_provider text,
ADD COLUMN identity_subject text;

UPDATE public.auth_sessions AS session
SET
  identity_provider = (
    SELECT candidate.provider
    FROM public.auth_identities AS candidate
    WHERE candidate.user_id = session.user_id
    ORDER BY candidate.created_at, candidate.id
    LIMIT 1
  ),
  identity_subject = (
    SELECT candidate.provider_subject
    FROM public.auth_identities AS candidate
    WHERE candidate.user_id = session.user_id
    ORDER BY candidate.created_at, candidate.id
    LIMIT 1
  );

ALTER TABLE public.auth_sessions
ALTER COLUMN identity_provider SET NOT NULL,
ALTER COLUMN identity_subject SET NOT NULL;

ALTER TABLE public.auth_sessions
ADD CONSTRAINT auth_sessions_identity_provider_valid CHECK (
  identity_provider IN ('supabase', 'test')
),
ADD CONSTRAINT auth_sessions_identity_subject_valid CHECK (
  length(btrim(identity_subject)) BETWEEN 1 AND 255
);

DROP FUNCTION app_private.create_auth_session(
  bytea, uuid, text, text, uuid, timestamptz, bytea, bytea
);

CREATE FUNCTION app_private.create_auth_session(
  requested_token_hash bytea,
  requested_user_id uuid,
  requested_identity_provider text,
  requested_identity_subject text,
  requested_audience text,
  requested_assurance_level text,
  requested_tenant_id uuid,
  requested_expires_at timestamptz,
  requested_user_agent_hash bytea,
  requested_ip_hash bytea
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  created_session_id uuid;
BEGIN
  IF octet_length(requested_token_hash) <> 32 THEN
    RAISE EXCEPTION 'invalid session token hash' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.auth_identities AS identity
    JOIN public.users AS account ON account.id = identity.user_id
    WHERE identity.user_id = requested_user_id
      AND identity.provider = requested_identity_provider
      AND identity.provider_subject = requested_identity_subject
      AND account.status = 'active'
      AND account.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'identity link rejected' USING ERRCODE = '42501';
  END IF;

  IF requested_audience = 'client_admin' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.tenant_memberships AS membership
      JOIN public.tenants AS tenant ON tenant.id = membership.tenant_id
      WHERE membership.user_id = requested_user_id
        AND membership.role = 'client_admin'
        AND membership.status = 'active'
        AND tenant.status = 'active'
        AND tenant.deleted_at IS NULL
        AND (
          requested_tenant_id IS NULL
          OR membership.tenant_id = requested_tenant_id
        )
    ) THEN
      RAISE EXCEPTION 'client membership rejected' USING ERRCODE = '42501';
    END IF;
  ELSIF requested_audience = 'nexi_admin' THEN
    IF requested_assurance_level <> 'aal2'
      OR requested_tenant_id IS NOT NULL
      OR NOT app_private.is_active_platform_staff(requested_user_id)
    THEN
      RAISE EXCEPTION 'staff access denied' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid audience' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.auth_sessions (
    token_hash,
    user_id,
    identity_provider,
    identity_subject,
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
    requested_identity_provider,
    requested_identity_subject,
    requested_audience,
    requested_assurance_level,
    requested_tenant_id,
    requested_expires_at,
    requested_user_agent_hash,
    requested_ip_hash
  )
  RETURNING id INTO created_session_id;

  RETURN created_session_id;
END
$function$;

REVOKE ALL ON FUNCTION app_private.create_auth_session(
  bytea, uuid, text, text, text, text, uuid, timestamptz, bytea, bytea
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.create_auth_session(
  bytea, uuid, text, text, text, text, uuid, timestamptz, bytea, bytea
) TO nexi_app;

DROP FUNCTION app_private.read_auth_session(bytea);

CREATE FUNCTION app_private.read_auth_session(requested_token_hash bytea)
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  identity_provider text,
  identity_subject text,
  email text,
  display_name text,
  audience text,
  assurance_level text,
  active_tenant_id uuid,
  active_tenant_name text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  UPDATE public.auth_sessions AS session
  SET last_seen_at = transaction_timestamp()
  FROM public.users AS account
  WHERE session.token_hash = requested_token_hash
    AND session.user_id = account.id
    AND session.revoked_at IS NULL
    AND session.expires_at > transaction_timestamp()
    AND account.status = 'active'
    AND account.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.auth_identities AS identity
      WHERE identity.user_id = session.user_id
        AND identity.provider = session.identity_provider
        AND identity.provider_subject = session.identity_subject
    )
    AND (
      (
        session.audience = 'client_admin'
        AND EXISTS (
          SELECT 1
          FROM public.tenant_memberships AS membership
          JOIN public.tenants AS tenant ON tenant.id = membership.tenant_id
          WHERE membership.user_id = session.user_id
            AND membership.role = 'client_admin'
            AND membership.status = 'active'
            AND tenant.status = 'active'
            AND tenant.deleted_at IS NULL
            AND (
              session.active_tenant_id IS NULL
              OR membership.tenant_id = session.active_tenant_id
            )
        )
      )
      OR (
        session.audience = 'nexi_admin'
        AND session.assurance_level = 'aal2'
        AND app_private.is_active_platform_staff(session.user_id)
      )
    );

  RETURN QUERY
  SELECT
    session.id,
    session.user_id,
    session.identity_provider,
    session.identity_subject,
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
    AND EXISTS (
      SELECT 1
      FROM public.auth_identities AS identity
      WHERE identity.user_id = session.user_id
        AND identity.provider = session.identity_provider
        AND identity.provider_subject = session.identity_subject
    )
    AND (
      (
        session.audience = 'client_admin'
        AND EXISTS (
          SELECT 1
          FROM public.tenant_memberships AS membership
          JOIN public.tenants AS active_tenant
            ON active_tenant.id = membership.tenant_id
          WHERE membership.user_id = session.user_id
            AND membership.role = 'client_admin'
            AND membership.status = 'active'
            AND active_tenant.status = 'active'
            AND active_tenant.deleted_at IS NULL
            AND (
              session.active_tenant_id IS NULL
              OR membership.tenant_id = session.active_tenant_id
            )
        )
      )
      OR (
        session.audience = 'nexi_admin'
        AND session.assurance_level = 'aal2'
        AND app_private.is_active_platform_staff(session.user_id)
      )
    )
  LIMIT 1;
END
$function$;

REVOKE ALL ON FUNCTION app_private.read_auth_session(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.read_auth_session(bytea) TO nexi_app;

CREATE OR REPLACE FUNCTION app_private.rotate_auth_session_tenant(
  requested_old_token_hash bytea,
  requested_new_token_hash bytea,
  requested_tenant_id uuid,
  requested_expires_at timestamptz,
  requested_user_agent_hash bytea,
  requested_ip_hash bytea
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  current_session public.auth_sessions%ROWTYPE;
  created_session_id uuid;
BEGIN
  SELECT *
  INTO current_session
  FROM public.auth_sessions
  WHERE token_hash = requested_old_token_hash
    AND audience = 'client_admin'
    AND revoked_at IS NULL
    AND expires_at > transaction_timestamp()
  FOR UPDATE;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS membership
    JOIN public.tenants AS tenant ON tenant.id = membership.tenant_id
    WHERE membership.user_id = current_session.user_id
      AND membership.tenant_id = requested_tenant_id
      AND membership.role = 'client_admin'
      AND membership.status = 'active'
      AND tenant.status = 'active'
      AND tenant.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid tenant selection' USING ERRCODE = '42501';
  END IF;

  UPDATE public.auth_sessions
  SET
    revoked_at = transaction_timestamp(),
    revoke_reason = 'tenant_rotation'
  WHERE id = current_session.id;

  INSERT INTO public.auth_sessions (
    token_hash,
    user_id,
    identity_provider,
    identity_subject,
    audience,
    assurance_level,
    active_tenant_id,
    expires_at,
    user_agent_hash,
    ip_hash
  )
  VALUES (
    requested_new_token_hash,
    current_session.user_id,
    current_session.identity_provider,
    current_session.identity_subject,
    current_session.audience,
    current_session.assurance_level,
    requested_tenant_id,
    LEAST(requested_expires_at, current_session.expires_at),
    requested_user_agent_hash,
    requested_ip_hash
  )
  RETURNING id INTO created_session_id;

  RETURN created_session_id;
END
$function$;

CREATE TABLE public.auth_recovery_grants (
  grant_hash bytea PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT auth_recovery_grants_hash_length CHECK (
    octet_length(grant_hash) = 32
  ),
  CONSTRAINT auth_recovery_grants_expiry_valid CHECK (
    expires_at > created_at
  )
);

CREATE INDEX auth_recovery_grants_expiry_idx
ON public.auth_recovery_grants (expires_at)
WHERE consumed_at IS NULL;

CREATE FUNCTION app_private.register_auth_recovery_grant(
  requested_grant_hash bytea,
  requested_expires_at timestamptz
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  INSERT INTO public.auth_recovery_grants (grant_hash, expires_at)
  VALUES (requested_grant_hash, requested_expires_at)
$function$;

CREATE FUNCTION app_private.consume_auth_recovery_grant(
  requested_grant_hash bytea
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  WITH consumed AS (
    UPDATE public.auth_recovery_grants
    SET consumed_at = transaction_timestamp()
    WHERE grant_hash = requested_grant_hash
      AND consumed_at IS NULL
      AND expires_at > transaction_timestamp()
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM consumed)
$function$;

REVOKE ALL ON TABLE public.auth_recovery_grants FROM PUBLIC, nexi_app;
REVOKE ALL ON FUNCTION app_private.register_auth_recovery_grant(
  bytea, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.consume_auth_recovery_grant(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.register_auth_recovery_grant(
  bytea, timestamptz
) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.consume_auth_recovery_grant(bytea)
TO nexi_app;

ALTER TABLE public.auth_rate_limits
DROP CONSTRAINT auth_rate_limits_scope_valid;

ALTER TABLE public.auth_rate_limits
ADD CONSTRAINT auth_rate_limits_scope_valid CHECK (
  scope IN (
    'login_ip',
    'login_identity',
    'recovery_ip',
    'recovery_identity',
    'recovery_verify_ip',
    'password_reset_ip',
    'tenant_selection'
  )
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
    'session_revoked',
    'tenant_selected',
    'password_recovery_requested',
    'password_reset_completed',
    'mfa_required',
    'mfa_succeeded',
    'access_denied'
  )
);
