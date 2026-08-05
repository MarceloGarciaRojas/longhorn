CREATE TABLE public.auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  provider_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT auth_identities_provider_subject_unique
    UNIQUE (provider, provider_subject),
  CONSTRAINT auth_identities_provider_email_unique
    UNIQUE (provider, provider_email),
  CONSTRAINT auth_identities_provider_valid CHECK (
    provider IN ('supabase', 'test')
  ),
  CONSTRAINT auth_identities_subject_valid CHECK (
    length(btrim(provider_subject)) BETWEEN 1 AND 255
  ),
  CONSTRAINT auth_identities_email_normalized CHECK (
    provider_email = lower(btrim(provider_email))
    AND length(provider_email) BETWEEN 3 AND 254
  ),
  CONSTRAINT auth_identities_user_fk
    FOREIGN KEY (user_id)
    REFERENCES public.users (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX auth_identities_user_idx
ON public.auth_identities (user_id);

CREATE TRIGGER auth_identities_set_updated_at
BEFORE UPDATE ON public.auth_identities
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.platform_staff (
  user_id uuid PRIMARY KEY,
  role text NOT NULL DEFAULT 'nexi_admin',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT platform_staff_role_valid CHECK (
    role IN ('nexi_admin')
  ),
  CONSTRAINT platform_staff_status_valid CHECK (
    status IN ('active', 'disabled')
  ),
  CONSTRAINT platform_staff_user_fk
    FOREIGN KEY (user_id)
    REFERENCES public.users (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE TRIGGER platform_staff_set_updated_at
BEFORE UPDATE ON public.platform_staff
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL,
  user_id uuid NOT NULL,
  audience text NOT NULL,
  assurance_level text NOT NULL,
  active_tenant_id uuid,
  user_agent_hash bytea,
  ip_hash bytea,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text,
  CONSTRAINT auth_sessions_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT auth_sessions_token_hash_length CHECK (
    octet_length(token_hash) = 32
  ),
  CONSTRAINT auth_sessions_audience_valid CHECK (
    audience IN ('client_admin', 'nexi_admin')
  ),
  CONSTRAINT auth_sessions_assurance_valid CHECK (
    assurance_level IN ('aal1', 'aal2')
  ),
  CONSTRAINT auth_sessions_expiry_valid CHECK (
    expires_at > created_at
  ),
  CONSTRAINT auth_sessions_revoke_reason_valid CHECK (
    revoke_reason IS NULL OR length(btrim(revoke_reason)) BETWEEN 1 AND 80
  ),
  CONSTRAINT auth_sessions_user_fk
    FOREIGN KEY (user_id)
    REFERENCES public.users (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT auth_sessions_tenant_fk
    FOREIGN KEY (active_tenant_id)
    REFERENCES public.tenants (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX auth_sessions_user_active_idx
ON public.auth_sessions (user_id, expires_at)
WHERE revoked_at IS NULL;

CREATE TABLE public.auth_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  user_id uuid,
  tenant_id uuid,
  provider text,
  audience text,
  event_type text NOT NULL,
  outcome text NOT NULL,
  correlation_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT auth_audit_provider_valid CHECK (
    provider IS NULL OR provider IN ('supabase', 'test')
  ),
  CONSTRAINT auth_audit_audience_valid CHECK (
    audience IS NULL OR audience IN ('client_admin', 'nexi_admin')
  ),
  CONSTRAINT auth_audit_event_type_valid CHECK (
    event_type IN (
      'login_succeeded',
      'login_failed',
      'login_rate_limited',
      'logout',
      'session_rejected',
      'tenant_selected',
      'password_recovery_requested'
    )
  ),
  CONSTRAINT auth_audit_outcome_valid CHECK (
    outcome IN ('succeeded', 'failed', 'blocked')
  ),
  CONSTRAINT auth_audit_correlation_valid CHECK (
    length(correlation_id) BETWEEN 1 AND 128
  ),
  CONSTRAINT auth_audit_metadata_object CHECK (
    jsonb_typeof(metadata) = 'object'
  ),
  CONSTRAINT auth_audit_user_fk
    FOREIGN KEY (user_id)
    REFERENCES public.users (id)
    ON UPDATE RESTRICT
    ON DELETE SET NULL,
  CONSTRAINT auth_audit_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id)
    ON UPDATE RESTRICT
    ON DELETE SET NULL
);

CREATE INDEX auth_audit_occurred_at_idx
ON public.auth_audit_events (occurred_at DESC);

CREATE INDEX auth_audit_user_occurred_idx
ON public.auth_audit_events (user_id, occurred_at DESC)
WHERE user_id IS NOT NULL;

CREATE TABLE public.auth_rate_limits (
  scope text NOT NULL,
  key_hash bytea NOT NULL,
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (scope, key_hash),
  CONSTRAINT auth_rate_limits_scope_valid CHECK (
    scope IN ('login_ip', 'login_identity', 'recovery_ip', 'recovery_identity')
  ),
  CONSTRAINT auth_rate_limits_key_hash_length CHECK (
    octet_length(key_hash) = 32
  ),
  CONSTRAINT auth_rate_limits_attempts_valid CHECK (
    attempts >= 0
  )
);

CREATE FUNCTION app_private.resolve_auth_identity(
  requested_provider text,
  requested_subject text,
  requested_email text
)
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  user_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    account.id,
    account.email,
    account.display_name,
    account.status
  FROM public.auth_identities AS identity
  JOIN public.users AS account ON account.id = identity.user_id
  WHERE identity.provider = requested_provider
    AND identity.provider_subject = requested_subject
    AND identity.provider_email = lower(btrim(requested_email))
    AND account.email = identity.provider_email
    AND account.deleted_at IS NULL
  LIMIT 1
$function$;

CREATE FUNCTION app_private.list_auth_tenants(requested_user_id uuid)
RETURNS TABLE (
  tenant_id uuid,
  tenant_slug text,
  tenant_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    tenant.id,
    tenant.slug,
    tenant.display_name
  FROM public.tenant_memberships AS membership
  JOIN public.tenants AS tenant ON tenant.id = membership.tenant_id
  JOIN public.users AS account ON account.id = membership.user_id
  WHERE membership.user_id = requested_user_id
    AND membership.status = 'active'
    AND tenant.status = 'active'
    AND tenant.deleted_at IS NULL
    AND account.status = 'active'
    AND account.deleted_at IS NULL
  ORDER BY tenant.display_name, tenant.id
$function$;

CREATE FUNCTION app_private.is_active_platform_staff(requested_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_staff AS staff
    JOIN public.users AS account ON account.id = staff.user_id
    WHERE staff.user_id = requested_user_id
      AND staff.role = 'nexi_admin'
      AND staff.status = 'active'
      AND account.status = 'active'
      AND account.deleted_at IS NULL
  )
$function$;

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

  IF requested_audience = 'client_admin' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.users AS account
      WHERE account.id = requested_user_id
        AND account.status = 'active'
        AND account.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'inactive account' USING ERRCODE = '42501';
    END IF;

    IF requested_tenant_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.tenant_memberships AS membership
      JOIN public.tenants AS tenant ON tenant.id = membership.tenant_id
      WHERE membership.user_id = requested_user_id
        AND membership.tenant_id = requested_tenant_id
        AND membership.status = 'active'
        AND tenant.status = 'active'
        AND tenant.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'invalid tenant selection' USING ERRCODE = '42501';
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
  RETURNING id INTO created_session_id;

  RETURN created_session_id;
END
$function$;

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
    AND (
      (
        session.audience = 'client_admin'
        AND (
          session.active_tenant_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.tenant_memberships AS membership
            JOIN public.tenants AS tenant
              ON tenant.id = membership.tenant_id
            WHERE membership.user_id = session.user_id
              AND membership.tenant_id = session.active_tenant_id
              AND membership.status = 'active'
              AND tenant.status = 'active'
              AND tenant.deleted_at IS NULL
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
    AND (
      (
        session.audience = 'client_admin'
        AND (
          session.active_tenant_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.tenant_memberships AS membership
            WHERE membership.user_id = session.user_id
              AND membership.tenant_id = session.active_tenant_id
              AND membership.status = 'active'
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

CREATE FUNCTION app_private.revoke_auth_session(
  requested_token_hash bytea,
  requested_reason text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  WITH revoked AS (
    UPDATE public.auth_sessions
    SET
      revoked_at = COALESCE(revoked_at, transaction_timestamp()),
      revoke_reason = COALESCE(revoke_reason, requested_reason)
    WHERE token_hash = requested_token_hash
      AND revoked_at IS NULL
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM revoked)
$function$;

CREATE FUNCTION app_private.rotate_auth_session_tenant(
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

CREATE FUNCTION app_private.consume_auth_rate_limit(
  requested_scope text,
  requested_key_hash bytea,
  requested_max_attempts integer,
  requested_window_seconds integer,
  requested_block_seconds integer
)
RETURNS TABLE (
  allowed boolean,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  limiter public.auth_rate_limits%ROWTYPE;
  now_at timestamptz := transaction_timestamp();
BEGIN
  IF requested_max_attempts < 1
    OR requested_window_seconds < 1
    OR requested_block_seconds < 1
  THEN
    RAISE EXCEPTION 'invalid rate limit configuration' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.auth_rate_limits (
    scope,
    key_hash,
    window_started_at,
    attempts
  )
  VALUES (
    requested_scope,
    requested_key_hash,
    now_at,
    0
  )
  ON CONFLICT (scope, key_hash) DO NOTHING;

  SELECT *
  INTO limiter
  FROM public.auth_rate_limits
  WHERE scope = requested_scope
    AND key_hash = requested_key_hash
  FOR UPDATE;

  IF limiter.blocked_until IS NOT NULL AND limiter.blocked_until > now_at THEN
    RETURN QUERY SELECT false, GREATEST(
      1,
      ceil(extract(epoch FROM limiter.blocked_until - now_at))::integer
    );
    RETURN;
  END IF;

  IF limiter.window_started_at
    + make_interval(secs => requested_window_seconds) <= now_at
  THEN
    limiter.window_started_at := now_at;
    limiter.attempts := 0;
    limiter.blocked_until := NULL;
  END IF;

  limiter.attempts := limiter.attempts + 1;
  IF limiter.attempts > requested_max_attempts THEN
    limiter.blocked_until := now_at
      + make_interval(secs => requested_block_seconds);
  END IF;

  UPDATE public.auth_rate_limits
  SET
    window_started_at = limiter.window_started_at,
    attempts = limiter.attempts,
    blocked_until = limiter.blocked_until,
    updated_at = now_at
  WHERE scope = requested_scope
    AND key_hash = requested_key_hash;

  IF limiter.blocked_until IS NOT NULL THEN
    RETURN QUERY SELECT false, requested_block_seconds;
  ELSE
    RETURN QUERY SELECT true, 0;
  END IF;
END
$function$;

CREATE FUNCTION app_private.write_auth_audit_event(
  requested_user_id uuid,
  requested_tenant_id uuid,
  requested_provider text,
  requested_audience text,
  requested_event_type text,
  requested_outcome text,
  requested_correlation_id text,
  requested_metadata jsonb
)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  INSERT INTO public.auth_audit_events (
    user_id,
    tenant_id,
    provider,
    audience,
    event_type,
    outcome,
    correlation_id,
    metadata
  )
  VALUES (
    requested_user_id,
    requested_tenant_id,
    requested_provider,
    requested_audience,
    requested_event_type,
    requested_outcome,
    requested_correlation_id,
    COALESCE(requested_metadata, '{}'::jsonb)
  )
  RETURNING id
$function$;

REVOKE ALL ON TABLE public.auth_identities FROM PUBLIC, nexi_app;
REVOKE ALL ON TABLE public.platform_staff FROM PUBLIC, nexi_app;
REVOKE ALL ON TABLE public.auth_sessions FROM PUBLIC, nexi_app;
REVOKE ALL ON TABLE public.auth_audit_events FROM PUBLIC, nexi_app;
REVOKE ALL ON TABLE public.auth_rate_limits FROM PUBLIC, nexi_app;
REVOKE ALL ON SEQUENCE public.auth_audit_events_id_seq FROM PUBLIC, nexi_app;

REVOKE ALL ON FUNCTION app_private.resolve_auth_identity(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.list_auth_tenants(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.is_active_platform_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.create_auth_session(bytea, uuid, text, text, uuid, timestamptz, bytea, bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.read_auth_session(bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.revoke_auth_session(bytea, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.rotate_auth_session_tenant(bytea, bytea, uuid, timestamptz, bytea, bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.consume_auth_rate_limit(text, bytea, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.write_auth_audit_event(uuid, uuid, text, text, text, text, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_private.resolve_auth_identity(text, text, text) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.list_auth_tenants(uuid) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.is_active_platform_staff(uuid) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.create_auth_session(bytea, uuid, text, text, uuid, timestamptz, bytea, bytea) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.read_auth_session(bytea) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.revoke_auth_session(bytea, text) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.rotate_auth_session_tenant(bytea, bytea, uuid, timestamptz, bytea, bytea) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.consume_auth_rate_limit(text, bytea, integer, integer, integer) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.write_auth_audit_event(uuid, uuid, text, text, text, text, text, jsonb) TO nexi_app;
