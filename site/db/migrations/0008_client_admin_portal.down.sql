REVOKE ALL ON FUNCTION app_private.client_record_event(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb
) FROM nexi_app;
REVOKE ALL ON FUNCTION app_private.list_client_companies(uuid, uuid) FROM nexi_app;
REVOKE ALL ON FUNCTION app_private.require_client_session(uuid, uuid, uuid) FROM nexi_app;

DROP FUNCTION app_private.client_record_event(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb
);
DROP FUNCTION app_private.list_client_companies(uuid, uuid);
DROP FUNCTION app_private.require_client_session(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION app_private.create_auth_session(
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
    token_hash, user_id, identity_provider, identity_subject, audience,
    assurance_level, active_tenant_id, expires_at, user_agent_hash, ip_hash
  )
  VALUES (
    requested_token_hash, requested_user_id, requested_identity_provider,
    requested_identity_subject, requested_audience, requested_assurance_level,
    requested_tenant_id, requested_expires_at, requested_user_agent_hash,
    requested_ip_hash
  )
  RETURNING id INTO created_session_id;
  RETURN created_session_id;
END
$function$;

CREATE OR REPLACE FUNCTION app_private.read_auth_session(
  requested_token_hash bytea
)
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

ALTER TABLE public.auth_rate_limits
DROP CONSTRAINT auth_rate_limits_scope_valid;

DELETE FROM public.auth_rate_limits
WHERE scope = 'client_mutation';

ALTER TABLE public.auth_rate_limits
ADD CONSTRAINT auth_rate_limits_scope_valid CHECK (
  scope IN (
    'login_ip', 'login_identity', 'recovery_ip', 'recovery_identity',
    'recovery_verify_ip', 'password_reset_ip', 'tenant_selection',
    'admin_mutation', 'invitation_acceptance'
  )
);

UPDATE public.platform_audit_events
SET
  metadata = metadata || jsonb_build_object(
    'rolled_back_client_action', action,
    'rolled_back_resource_type', resource_type
  ),
  action = 'admin_access_denied',
  resource_type = 'admin_route',
  reason = COALESCE(reason, 'Evento de cliente conservado durante rollback.')
WHERE action IN (
  'client_panel_accessed',
  'personal_profile_updated',
  'tenant_profile_updated'
);

ALTER TABLE public.platform_audit_events
DROP CONSTRAINT platform_audit_action_valid;

ALTER TABLE public.platform_audit_events
ADD CONSTRAINT platform_audit_action_valid CHECK (
  action IN (
    'tenant_created', 'tenant_updated', 'tenant_activated',
    'tenant_suspended', 'tenant_reactivated', 'invitation_created',
    'invitation_resent', 'invitation_failed', 'invitation_revoked',
    'invitation_accepted', 'membership_created', 'membership_disabled',
    'membership_reactivated', 'admin_access_denied'
  )
);

ALTER TABLE public.platform_audit_events
DROP CONSTRAINT platform_audit_resource_type_valid;

ALTER TABLE public.platform_audit_events
ADD CONSTRAINT platform_audit_resource_type_valid CHECK (
  resource_type IN ('tenant', 'invitation', 'membership', 'admin_route')
);

DROP POLICY IF EXISTS tenants_update_current_profile ON public.tenants;
DROP POLICY IF EXISTS users_update_self ON public.users;

REVOKE UPDATE (display_name, timezone, locale) ON TABLE public.tenants FROM nexi_app;
REVOKE UPDATE (display_name) ON TABLE public.users FROM nexi_app;

CREATE OR REPLACE FUNCTION app_private.current_actor_is_active_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS membership
    WHERE membership.tenant_id = app_context.current_tenant_id()
      AND membership.user_id = app_context.current_user_id()
      AND membership.status = 'active'
  )
$function$;

DROP POLICY IF EXISTS plan_features_select_assigned ON public.plan_features;
DROP POLICY IF EXISTS plans_select_assigned ON public.plans;

DROP TABLE public.tenant_plan_assignments;
DROP TABLE public.plan_features;
DROP TABLE public.plans;
DROP TABLE public.sites;
DROP TABLE public.tenant_profiles;
DROP TABLE public.user_profiles;
