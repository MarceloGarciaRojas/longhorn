CREATE TABLE public.user_profiles (
  user_id uuid PRIMARY KEY,
  phone text,
  locale text NOT NULL DEFAULT 'es-CL',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT user_profiles_user_fk
    FOREIGN KEY (user_id) REFERENCES public.users (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT user_profiles_phone_valid CHECK (
    phone IS NULL OR length(btrim(phone)) BETWEEN 6 AND 32
  ),
  CONSTRAINT user_profiles_locale_valid CHECK (
    locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'
  ),
  CONSTRAINT user_profiles_version_valid CHECK (version > 0)
);

CREATE TRIGGER user_profiles_set_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.tenant_profiles (
  tenant_id uuid PRIMARY KEY,
  legal_name text,
  contact_email text,
  contact_phone text,
  description text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT tenant_profiles_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_profiles_legal_name_valid CHECK (
    legal_name IS NULL OR length(btrim(legal_name)) BETWEEN 1 AND 160
  ),
  CONSTRAINT tenant_profiles_contact_email_valid CHECK (
    contact_email IS NULL OR (
      contact_email = lower(btrim(contact_email))
      AND length(contact_email) BETWEEN 3 AND 254
      AND contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    )
  ),
  CONSTRAINT tenant_profiles_contact_phone_valid CHECK (
    contact_phone IS NULL OR length(btrim(contact_phone)) BETWEEN 6 AND 32
  ),
  CONSTRAINT tenant_profiles_description_valid CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  ),
  CONSTRAINT tenant_profiles_version_valid CHECK (version > 0)
);

CREATE TRIGGER tenant_profiles_set_updated_at
BEFORE UPDATE ON public.tenant_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  display_name text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'preparing',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  deleted_at timestamptz,
  CONSTRAINT sites_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT sites_tenant_slug_unique UNIQUE (tenant_id, slug),
  CONSTRAINT sites_display_name_valid CHECK (
    length(btrim(display_name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT sites_slug_format CHECK (
    length(slug) BETWEEN 3 AND 63
    AND slug = lower(btrim(slug))
    AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  CONSTRAINT sites_status_valid CHECK (
    status IN ('preparing', 'active', 'suspended')
  )
);

CREATE INDEX sites_tenant_status_idx
ON public.sites (tenant_id, status, created_at DESC)
WHERE deleted_at IS NULL;

CREATE TRIGGER sites_set_updated_at
BEFORE UPDATE ON public.sites
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  display_name text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT plans_code_unique UNIQUE (code),
  CONSTRAINT plans_code_format CHECK (
    length(code) BETWEEN 3 AND 40
    AND code = lower(btrim(code))
    AND code ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
  ),
  CONSTRAINT plans_display_name_valid CHECK (
    length(btrim(display_name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT plans_description_valid CHECK (
    length(btrim(description)) BETWEEN 1 AND 500
  ),
  CONSTRAINT plans_status_valid CHECK (status IN ('active', 'inactive'))
);

CREATE TRIGGER plans_set_updated_at
BEFORE UPDATE ON public.plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  feature_key text NOT NULL,
  display_name text NOT NULL,
  detail text,
  display_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT plan_features_plan_fk
    FOREIGN KEY (plan_id) REFERENCES public.plans (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT plan_features_plan_key_unique UNIQUE (plan_id, feature_key),
  CONSTRAINT plan_features_key_format CHECK (
    length(feature_key) BETWEEN 3 AND 60
    AND feature_key = lower(btrim(feature_key))
    AND feature_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
  ),
  CONSTRAINT plan_features_display_name_valid CHECK (
    length(btrim(display_name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT plan_features_detail_valid CHECK (
    detail IS NULL OR length(btrim(detail)) BETWEEN 1 AND 240
  ),
  CONSTRAINT plan_features_order_valid CHECK (display_order >= 0),
  CONSTRAINT plan_features_status_valid CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX plan_features_plan_order_idx
ON public.plan_features (plan_id, display_order, id)
WHERE status = 'active';

CREATE TRIGGER plan_features_set_updated_at
BEFORE UPDATE ON public.plan_features
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.tenant_plan_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  starts_at timestamptz,
  reference_date date,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT tenant_plan_assignments_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_plan_assignments_plan_fk
    FOREIGN KEY (plan_id) REFERENCES public.plans (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_plan_assignments_tenant_unique UNIQUE (tenant_id),
  CONSTRAINT tenant_plan_assignments_status_valid CHECK (
    status IN ('pending', 'active', 'paused', 'ended')
  ),
  CONSTRAINT tenant_plan_assignments_version_valid CHECK (version > 0)
);

CREATE INDEX tenant_plan_assignments_plan_idx
ON public.tenant_plan_assignments (plan_id, status);

CREATE TRIGGER tenant_plan_assignments_set_updated_at
BEFORE UPDATE ON public.tenant_plan_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_plan_assignments ENABLE ROW LEVEL SECURITY;

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
    JOIN public.tenants AS tenant ON tenant.id = membership.tenant_id
    JOIN public.users AS account ON account.id = membership.user_id
    WHERE membership.tenant_id = app_context.current_tenant_id()
      AND membership.user_id = app_context.current_user_id()
      AND membership.role = 'client_admin'
      AND membership.status = 'active'
      AND tenant.status = 'active'
      AND tenant.deleted_at IS NULL
      AND account.status = 'active'
      AND account.deleted_at IS NULL
  )
$function$;

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
    IF requested_tenant_id IS NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.tenant_memberships AS membership
        WHERE membership.user_id = requested_user_id
          AND membership.role = 'client_admin'
      ) THEN
        RAISE EXCEPTION 'client membership rejected' USING ERRCODE = '42501';
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM public.tenant_memberships AS membership
      JOIN public.tenants AS tenant ON tenant.id = membership.tenant_id
      WHERE membership.user_id = requested_user_id
        AND membership.tenant_id = requested_tenant_id
        AND membership.role = 'client_admin'
        AND membership.status = 'active'
        AND tenant.status = 'active'
        AND tenant.deleted_at IS NULL
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
        AND (
          (
            session.active_tenant_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.tenant_memberships AS membership
              WHERE membership.user_id = session.user_id
                AND membership.role = 'client_admin'
            )
          )
          OR EXISTS (
            SELECT 1
            FROM public.tenant_memberships AS membership
            JOIN public.tenants AS tenant ON tenant.id = membership.tenant_id
            WHERE membership.user_id = session.user_id
              AND membership.tenant_id = session.active_tenant_id
              AND membership.role = 'client_admin'
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
        AND (
          (
            session.active_tenant_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.tenant_memberships AS membership
              WHERE membership.user_id = session.user_id
                AND membership.role = 'client_admin'
            )
          )
          OR EXISTS (
            SELECT 1
            FROM public.tenant_memberships AS membership
            JOIN public.tenants AS active_tenant
              ON active_tenant.id = membership.tenant_id
            WHERE membership.user_id = session.user_id
              AND membership.tenant_id = session.active_tenant_id
              AND membership.role = 'client_admin'
              AND membership.status = 'active'
              AND active_tenant.status = 'active'
              AND active_tenant.deleted_at IS NULL
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

CREATE POLICY user_profiles_select_self
ON public.user_profiles FOR SELECT TO nexi_app
USING (
  user_id = app_context.current_user_id()
  AND app_private.current_actor_is_active_member()
);

CREATE POLICY user_profiles_insert_self
ON public.user_profiles FOR INSERT TO nexi_app
WITH CHECK (
  user_id = app_context.current_user_id()
  AND app_private.current_actor_is_active_member()
);

CREATE POLICY user_profiles_update_self
ON public.user_profiles FOR UPDATE TO nexi_app
USING (
  user_id = app_context.current_user_id()
  AND app_private.current_actor_is_active_member()
)
WITH CHECK (
  user_id = app_context.current_user_id()
  AND app_private.current_actor_is_active_member()
);

CREATE POLICY tenant_profiles_select_current
ON public.tenant_profiles FOR SELECT TO nexi_app
USING (
  tenant_id = app_context.current_tenant_id()
  AND app_private.current_actor_is_active_member()
);

CREATE POLICY tenant_profiles_insert_current
ON public.tenant_profiles FOR INSERT TO nexi_app
WITH CHECK (
  tenant_id = app_context.current_tenant_id()
  AND app_private.current_actor_is_active_member()
);

CREATE POLICY tenant_profiles_update_current
ON public.tenant_profiles FOR UPDATE TO nexi_app
USING (
  tenant_id = app_context.current_tenant_id()
  AND app_private.current_actor_is_active_member()
)
WITH CHECK (
  tenant_id = app_context.current_tenant_id()
  AND app_private.current_actor_is_active_member()
);

CREATE POLICY sites_select_current
ON public.sites FOR SELECT TO nexi_app
USING (
  tenant_id = app_context.current_tenant_id()
  AND deleted_at IS NULL
  AND app_private.current_actor_is_active_member()
);

CREATE POLICY tenant_plan_assignments_select_current
ON public.tenant_plan_assignments FOR SELECT TO nexi_app
USING (
  tenant_id = app_context.current_tenant_id()
  AND app_private.current_actor_is_active_member()
);

CREATE POLICY plans_select_assigned
ON public.plans FOR SELECT TO nexi_app
USING (
  app_private.current_actor_is_active_member()
  AND EXISTS (
    SELECT 1
    FROM public.tenant_plan_assignments AS assignment
    WHERE assignment.tenant_id = app_context.current_tenant_id()
      AND assignment.plan_id = plans.id
  )
);

CREATE POLICY plan_features_select_assigned
ON public.plan_features FOR SELECT TO nexi_app
USING (
  status = 'active'
  AND app_private.current_actor_is_active_member()
  AND EXISTS (
    SELECT 1
    FROM public.tenant_plan_assignments AS assignment
    WHERE assignment.tenant_id = app_context.current_tenant_id()
      AND assignment.plan_id = plan_features.plan_id
  )
);

CREATE POLICY users_update_self
ON public.users FOR UPDATE TO nexi_app
USING (
  id = app_context.current_user_id()
  AND app_private.current_actor_is_active_member()
)
WITH CHECK (
  id = app_context.current_user_id()
  AND app_private.current_actor_is_active_member()
);

CREATE POLICY tenants_update_current_profile
ON public.tenants FOR UPDATE TO nexi_app
USING (
  id = app_context.current_tenant_id()
  AND app_private.current_actor_is_active_member()
)
WITH CHECK (
  id = app_context.current_tenant_id()
  AND status = 'active'
  AND deleted_at IS NULL
  AND app_private.current_actor_is_active_member()
);

REVOKE ALL ON TABLE public.user_profiles FROM PUBLIC, nexi_app;
REVOKE ALL ON TABLE public.tenant_profiles FROM PUBLIC, nexi_app;
REVOKE ALL ON TABLE public.sites FROM PUBLIC, nexi_app;
REVOKE ALL ON TABLE public.plans FROM PUBLIC, nexi_app;
REVOKE ALL ON TABLE public.plan_features FROM PUBLIC, nexi_app;
REVOKE ALL ON TABLE public.tenant_plan_assignments FROM PUBLIC, nexi_app;

GRANT SELECT, INSERT, UPDATE ON TABLE public.user_profiles TO nexi_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tenant_profiles TO nexi_app;
GRANT SELECT ON TABLE public.sites TO nexi_app;
GRANT SELECT ON TABLE public.plans TO nexi_app;
GRANT SELECT ON TABLE public.plan_features TO nexi_app;
GRANT SELECT ON TABLE public.tenant_plan_assignments TO nexi_app;
GRANT UPDATE (display_name) ON TABLE public.users TO nexi_app;
GRANT UPDATE (display_name, timezone, locale) ON TABLE public.tenants TO nexi_app;

CREATE FUNCTION app_private.require_client_session(
  requested_session_id uuid,
  requested_actor_user_id uuid,
  requested_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF app_context.current_user_id() IS DISTINCT FROM requested_actor_user_id
    OR app_context.current_tenant_id() IS DISTINCT FROM requested_tenant_id
    OR NOT app_private.current_actor_is_active_member()
    OR NOT EXISTS (
      SELECT 1
      FROM public.auth_sessions AS session
      WHERE session.id = requested_session_id
        AND session.user_id = requested_actor_user_id
        AND session.audience = 'client_admin'
        AND session.active_tenant_id = requested_tenant_id
        AND session.revoked_at IS NULL
        AND session.expires_at > transaction_timestamp()
    )
  THEN
    RAISE EXCEPTION 'client authorization denied' USING ERRCODE = '42501';
  END IF;
END
$function$;

CREATE FUNCTION app_private.list_client_companies(
  requested_session_id uuid,
  requested_actor_user_id uuid
)
RETURNS TABLE (
  tenant_id uuid,
  tenant_slug text,
  tenant_name text,
  tenant_status text,
  membership_status text,
  is_available boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.auth_sessions AS session
    JOIN public.users AS account ON account.id = session.user_id
    WHERE session.id = requested_session_id
      AND session.user_id = requested_actor_user_id
      AND session.audience = 'client_admin'
      AND session.revoked_at IS NULL
      AND session.expires_at > transaction_timestamp()
      AND account.status = 'active'
      AND account.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'client authorization denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    tenant.id,
    tenant.slug,
    tenant.display_name,
    tenant.status,
    membership.status,
    membership.status = 'active'
      AND tenant.status = 'active'
      AND tenant.deleted_at IS NULL
  FROM public.tenant_memberships AS membership
  JOIN public.tenants AS tenant ON tenant.id = membership.tenant_id
  WHERE membership.user_id = requested_actor_user_id
    AND membership.role = 'client_admin'
  ORDER BY tenant.display_name, tenant.id;
END
$function$;

ALTER TABLE public.platform_audit_events
DROP CONSTRAINT platform_audit_action_valid;

ALTER TABLE public.platform_audit_events
ADD CONSTRAINT platform_audit_action_valid CHECK (
  action IN (
    'tenant_created', 'tenant_updated', 'tenant_activated',
    'tenant_suspended', 'tenant_reactivated', 'invitation_created',
    'invitation_resent', 'invitation_failed', 'invitation_revoked',
    'invitation_accepted', 'membership_created', 'membership_disabled',
    'membership_reactivated', 'admin_access_denied',
    'client_panel_accessed', 'personal_profile_updated',
    'tenant_profile_updated'
  )
);

ALTER TABLE public.platform_audit_events
DROP CONSTRAINT platform_audit_resource_type_valid;

ALTER TABLE public.platform_audit_events
ADD CONSTRAINT platform_audit_resource_type_valid CHECK (
  resource_type IN (
    'tenant', 'invitation', 'membership', 'admin_route',
    'client_route', 'user_profile', 'tenant_profile'
  )
);

CREATE FUNCTION app_private.client_record_event(
  requested_session_id uuid,
  requested_actor_user_id uuid,
  requested_tenant_id uuid,
  requested_action text,
  requested_resource_type text,
  requested_resource_id text,
  requested_correlation_id text,
  requested_previous_state jsonb,
  requested_new_state jsonb,
  requested_metadata jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  created_event_id bigint;
BEGIN
  PERFORM app_private.require_client_session(
    requested_session_id,
    requested_actor_user_id,
    requested_tenant_id
  );

  IF requested_action NOT IN (
    'client_panel_accessed',
    'personal_profile_updated',
    'tenant_profile_updated'
  ) OR requested_resource_type NOT IN (
    'client_route', 'user_profile', 'tenant_profile'
  ) THEN
    RAISE EXCEPTION 'invalid client audit event' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.platform_audit_events (
    actor_user_id, tenant_id, action, resource_type, resource_id,
    outcome, correlation_id, previous_state, new_state, metadata
  )
  VALUES (
    requested_actor_user_id,
    requested_tenant_id,
    requested_action,
    requested_resource_type,
    requested_resource_id,
    'succeeded',
    requested_correlation_id,
    requested_previous_state,
    requested_new_state,
    COALESCE(requested_metadata, '{}'::jsonb)
  )
  RETURNING id INTO created_event_id;

  RETURN created_event_id;
END
$function$;

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

REVOKE ALL ON FUNCTION app_private.require_client_session(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.list_client_companies(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.client_record_event(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_private.require_client_session(uuid, uuid, uuid) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.list_client_companies(uuid, uuid) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.client_record_event(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb
) TO nexi_app;
