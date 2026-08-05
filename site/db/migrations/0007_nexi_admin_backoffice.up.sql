ALTER TABLE public.tenants
DROP CONSTRAINT tenants_status_valid;

ALTER TABLE public.tenants
ADD CONSTRAINT tenants_status_valid CHECK (
  status IN ('draft', 'active', 'suspended', 'archived')
);

ALTER TABLE public.tenants
ADD CONSTRAINT tenants_slug_not_reserved CHECK (
  slug NOT IN (
    'www', 'admin', 'api', 'app', 'login', 'auth', 'support', 'status',
    'static', 'assets', 'mail', 'nexi', 'longhorn'
  )
);

CREATE TABLE public.tenant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  email_normalized text NOT NULL,
  display_name text NOT NULL,
  intended_role text NOT NULL DEFAULT 'client_admin',
  status text NOT NULL DEFAULT 'failed',
  provider text NOT NULL,
  provider_reference text,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by_user_id uuid NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT tenant_invitations_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_invitations_actor_fk
    FOREIGN KEY (invited_by_user_id) REFERENCES public.users (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_invitations_email_valid CHECK (
    email_normalized = lower(btrim(email_normalized))
    AND length(email_normalized) BETWEEN 3 AND 254
    AND email_normalized ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  CONSTRAINT tenant_invitations_display_name_valid CHECK (
    length(btrim(display_name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT tenant_invitations_role_valid CHECK (
    intended_role = 'client_admin'
  ),
  CONSTRAINT tenant_invitations_status_valid CHECK (
    status IN ('pending', 'accepted', 'expired', 'revoked', 'failed')
  ),
  CONSTRAINT tenant_invitations_provider_valid CHECK (
    provider IN ('supabase', 'test')
  ),
  CONSTRAINT tenant_invitations_expiry_valid CHECK (
    expires_at > created_at
  ),
  CONSTRAINT tenant_invitations_attempt_valid CHECK (
    attempt_count BETWEEN 1 AND 50
  )
);

CREATE UNIQUE INDEX tenant_invitations_open_unique
ON public.tenant_invitations (tenant_id, email_normalized, intended_role)
WHERE status IN ('pending', 'failed');

CREATE INDEX tenant_invitations_tenant_created_idx
ON public.tenant_invitations (tenant_id, created_at DESC, id DESC);

CREATE INDEX tenant_invitations_status_expiry_idx
ON public.tenant_invitations (status, expires_at)
WHERE status = 'pending';

CREATE TRIGGER tenant_invitations_set_updated_at
BEFORE UPDATE ON public.tenant_invitations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.platform_idempotency_keys (
  actor_user_id uuid NOT NULL,
  operation text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_fingerprint text NOT NULL,
  result_resource_id uuid,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (actor_user_id, operation, idempotency_key),
  CONSTRAINT platform_idempotency_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES public.users (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT platform_idempotency_operation_valid CHECK (
    operation IN ('tenant_create', 'invitation_create')
  ),
  CONSTRAINT platform_idempotency_fingerprint_valid CHECK (
    length(request_fingerprint) = 64
    AND request_fingerprint ~ '^[0-9a-f]+$'
  )
);

CREATE TABLE public.platform_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  actor_user_id uuid,
  tenant_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  outcome text NOT NULL,
  correlation_id text NOT NULL,
  reason text,
  previous_state jsonb,
  new_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT platform_audit_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES public.users (id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT platform_audit_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT platform_audit_action_valid CHECK (
    action IN (
      'tenant_created', 'tenant_updated', 'tenant_activated',
      'tenant_suspended', 'tenant_reactivated', 'invitation_created', 'invitation_resent',
      'invitation_failed', 'invitation_revoked', 'invitation_accepted',
      'membership_created', 'membership_disabled', 'membership_reactivated',
      'admin_access_denied'
    )
  ),
  CONSTRAINT platform_audit_resource_type_valid CHECK (
    resource_type IN ('tenant', 'invitation', 'membership', 'admin_route')
  ),
  CONSTRAINT platform_audit_outcome_valid CHECK (
    outcome IN ('succeeded', 'failed', 'blocked')
  ),
  CONSTRAINT platform_audit_correlation_valid CHECK (
    length(correlation_id) BETWEEN 1 AND 128
  ),
  CONSTRAINT platform_audit_reason_valid CHECK (
    reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500
  ),
  CONSTRAINT platform_audit_previous_object CHECK (
    previous_state IS NULL OR jsonb_typeof(previous_state) = 'object'
  ),
  CONSTRAINT platform_audit_new_object CHECK (
    new_state IS NULL OR jsonb_typeof(new_state) = 'object'
  ),
  CONSTRAINT platform_audit_metadata_object CHECK (
    jsonb_typeof(metadata) = 'object'
  )
);

CREATE INDEX platform_audit_occurred_idx
ON public.platform_audit_events (occurred_at DESC, id DESC);

CREATE INDEX platform_audit_tenant_occurred_idx
ON public.platform_audit_events (tenant_id, occurred_at DESC, id DESC)
WHERE tenant_id IS NOT NULL;

ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_invitations FROM PUBLIC, nexi_app;
REVOKE ALL ON TABLE public.platform_idempotency_keys FROM PUBLIC, nexi_app;
REVOKE ALL ON TABLE public.platform_audit_events FROM PUBLIC, nexi_app;
REVOKE ALL ON SEQUENCE public.platform_audit_events_id_seq FROM PUBLIC, nexi_app;

CREATE FUNCTION app_private.require_nexi_admin_session(
  requested_session_id uuid,
  requested_actor_user_id uuid
)
RETURNS void
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
    JOIN public.platform_staff AS staff ON staff.user_id = account.id
    WHERE session.id = requested_session_id
      AND session.user_id = requested_actor_user_id
      AND session.audience = 'nexi_admin'
      AND session.assurance_level = 'aal2'
      AND session.active_tenant_id IS NULL
      AND session.revoked_at IS NULL
      AND session.expires_at > transaction_timestamp()
      AND account.status = 'active'
      AND account.deleted_at IS NULL
      AND staff.role = 'nexi_admin'
      AND staff.status = 'active'
  ) THEN
    RAISE EXCEPTION 'administrative access denied' USING ERRCODE = '42501';
  END IF;
END
$function$;

CREATE FUNCTION app_private.admin_dashboard(
  requested_session_id uuid,
  requested_actor_user_id uuid
)
RETURNS TABLE (
  tenant_total bigint,
  tenant_active bigint,
  tenant_suspended bigint,
  invitation_pending bigint,
  invitation_expired bigint,
  membership_active bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app_private.require_nexi_admin_session(
    requested_session_id, requested_actor_user_id
  );
  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.tenants WHERE deleted_at IS NULL),
    (SELECT count(*) FROM public.tenants
      WHERE status = 'active' AND deleted_at IS NULL),
    (SELECT count(*) FROM public.tenants
      WHERE status = 'suspended' AND deleted_at IS NULL),
    (SELECT count(*) FROM public.tenant_invitations
      WHERE status = 'pending' AND expires_at > transaction_timestamp()),
    (SELECT count(*) FROM public.tenant_invitations
      WHERE status = 'expired'
        OR (status = 'pending' AND expires_at <= transaction_timestamp())),
    (SELECT count(*) FROM public.tenant_memberships
      WHERE status = 'active' AND role = 'client_admin');
END
$function$;

CREATE FUNCTION app_private.admin_list_tenants(
  requested_session_id uuid,
  requested_actor_user_id uuid,
  requested_search text,
  requested_status text,
  requested_sort text,
  requested_limit integer,
  requested_offset integer
)
RETURNS TABLE (
  tenant_id uuid,
  tenant_slug text,
  tenant_name text,
  tenant_status text,
  tenant_timezone text,
  tenant_locale text,
  tenant_created_at timestamptz,
  tenant_updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app_private.require_nexi_admin_session(
    requested_session_id, requested_actor_user_id
  );
  IF requested_limit NOT BETWEEN 1 AND 50 OR requested_offset < 0 THEN
    RAISE EXCEPTION 'invalid pagination' USING ERRCODE = '22023';
  END IF;
  IF requested_status IS NOT NULL
    AND requested_status NOT IN ('draft', 'active', 'suspended')
  THEN
    RAISE EXCEPTION 'invalid tenant status filter' USING ERRCODE = '22023';
  END IF;
  IF requested_sort NOT IN ('created_desc', 'name_asc') THEN
    RAISE EXCEPTION 'invalid tenant sort' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    tenant.id,
    tenant.slug,
    tenant.display_name,
    tenant.status,
    tenant.timezone,
    tenant.locale,
    tenant.created_at,
    tenant.updated_at,
    count(*) OVER ()
  FROM public.tenants AS tenant
  WHERE tenant.deleted_at IS NULL
    AND (
      requested_search IS NULL
      OR tenant.display_name ILIKE '%' || requested_search || '%'
      OR tenant.slug ILIKE '%' || requested_search || '%'
    )
    AND (requested_status IS NULL OR tenant.status = requested_status)
  ORDER BY
    CASE WHEN requested_sort = 'name_asc' THEN lower(tenant.display_name) END,
    CASE WHEN requested_sort = 'created_desc' THEN tenant.created_at END DESC,
    tenant.id
  LIMIT requested_limit OFFSET requested_offset;
END
$function$;

CREATE FUNCTION app_private.admin_get_tenant(
  requested_session_id uuid,
  requested_actor_user_id uuid,
  requested_tenant_id uuid
)
RETURNS TABLE (
  tenant_id uuid,
  tenant_slug text,
  tenant_name text,
  tenant_status text,
  tenant_timezone text,
  tenant_locale text,
  tenant_created_at timestamptz,
  tenant_updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app_private.require_nexi_admin_session(
    requested_session_id, requested_actor_user_id
  );
  RETURN QUERY
  SELECT
    tenant.id, tenant.slug, tenant.display_name, tenant.status,
    tenant.timezone, tenant.locale, tenant.created_at, tenant.updated_at
  FROM public.tenants AS tenant
  WHERE tenant.id = requested_tenant_id
    AND tenant.deleted_at IS NULL;
END
$function$;

CREATE FUNCTION app_private.admin_list_memberships(
  requested_session_id uuid,
  requested_actor_user_id uuid,
  requested_tenant_id uuid
)
RETURNS TABLE (
  membership_id uuid,
  user_id uuid,
  user_name text,
  user_email text,
  membership_status text,
  membership_created_at timestamptz,
  membership_updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app_private.require_nexi_admin_session(
    requested_session_id, requested_actor_user_id
  );
  RETURN QUERY
  SELECT
    membership.id, account.id, account.display_name, account.email,
    membership.status, membership.created_at, membership.updated_at
  FROM public.tenant_memberships AS membership
  JOIN public.users AS account ON account.id = membership.user_id
  WHERE membership.tenant_id = requested_tenant_id
    AND membership.role = 'client_admin'
  ORDER BY lower(account.display_name), membership.id;
END
$function$;

CREATE FUNCTION app_private.admin_list_invitations(
  requested_session_id uuid,
  requested_actor_user_id uuid,
  requested_tenant_id uuid,
  requested_status text,
  requested_limit integer,
  requested_offset integer
)
RETURNS TABLE (
  invitation_id uuid,
  tenant_id uuid,
  tenant_name text,
  invitation_email text,
  invitation_name text,
  invitation_status text,
  invitation_provider text,
  invitation_expires_at timestamptz,
  invitation_accepted_at timestamptz,
  invitation_created_at timestamptz,
  invitation_attempt_count integer,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app_private.require_nexi_admin_session(
    requested_session_id, requested_actor_user_id
  );
  IF requested_limit NOT BETWEEN 1 AND 50 OR requested_offset < 0 THEN
    RAISE EXCEPTION 'invalid pagination' USING ERRCODE = '22023';
  END IF;
  IF requested_status IS NOT NULL
    AND requested_status NOT IN ('pending', 'accepted', 'expired', 'revoked', 'failed')
  THEN
    RAISE EXCEPTION 'invalid invitation status filter' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    invitation.id,
    invitation.tenant_id,
    tenant.display_name,
    invitation.email_normalized,
    invitation.display_name,
    CASE
      WHEN invitation.status = 'pending'
        AND invitation.expires_at <= transaction_timestamp()
      THEN 'expired'
      ELSE invitation.status
    END,
    invitation.provider,
    invitation.expires_at,
    invitation.accepted_at,
    invitation.created_at,
    invitation.attempt_count,
    count(*) OVER ()
  FROM public.tenant_invitations AS invitation
  JOIN public.tenants AS tenant ON tenant.id = invitation.tenant_id
  WHERE (requested_tenant_id IS NULL OR invitation.tenant_id = requested_tenant_id)
    AND (
      requested_status IS NULL
      OR CASE
        WHEN invitation.status = 'pending'
          AND invitation.expires_at <= transaction_timestamp()
        THEN 'expired'
        ELSE invitation.status
      END = requested_status
    )
  ORDER BY invitation.created_at DESC, invitation.id DESC
  LIMIT requested_limit OFFSET requested_offset;
END
$function$;

CREATE FUNCTION app_private.admin_list_audit_events(
  requested_session_id uuid,
  requested_actor_user_id uuid,
  requested_action text,
  requested_tenant_id uuid,
  requested_actor_search text,
  requested_from timestamptz,
  requested_to timestamptz,
  requested_outcome text,
  requested_limit integer,
  requested_offset integer
)
RETURNS TABLE (
  audit_id bigint,
  occurred_at timestamptz,
  actor_name text,
  actor_email text,
  tenant_id uuid,
  tenant_name text,
  action text,
  resource_type text,
  resource_id text,
  outcome text,
  correlation_id text,
  reason text,
  previous_state jsonb,
  new_state jsonb,
  metadata jsonb,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app_private.require_nexi_admin_session(
    requested_session_id, requested_actor_user_id
  );
  IF requested_limit NOT BETWEEN 1 AND 50 OR requested_offset < 0 THEN
    RAISE EXCEPTION 'invalid pagination' USING ERRCODE = '22023';
  END IF;
  IF requested_outcome IS NOT NULL
    AND requested_outcome NOT IN ('succeeded', 'failed', 'blocked')
  THEN
    RAISE EXCEPTION 'invalid audit outcome filter' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT
    event.id,
    event.occurred_at,
    account.display_name,
    account.email,
    event.tenant_id,
    tenant.display_name,
    event.action,
    event.resource_type,
    event.resource_id,
    event.outcome,
    event.correlation_id,
    event.reason,
    event.previous_state,
    event.new_state,
    event.metadata,
    count(*) OVER ()
  FROM public.platform_audit_events AS event
  LEFT JOIN public.users AS account ON account.id = event.actor_user_id
  LEFT JOIN public.tenants AS tenant ON tenant.id = event.tenant_id
  WHERE (requested_action IS NULL OR event.action = requested_action)
    AND (requested_tenant_id IS NULL OR event.tenant_id = requested_tenant_id)
    AND (
      requested_actor_search IS NULL
      OR account.email ILIKE '%' || requested_actor_search || '%'
      OR account.display_name ILIKE '%' || requested_actor_search || '%'
    )
    AND (requested_from IS NULL OR event.occurred_at >= requested_from)
    AND (requested_to IS NULL OR event.occurred_at < requested_to)
    AND (requested_outcome IS NULL OR event.outcome = requested_outcome)
  ORDER BY event.occurred_at DESC, event.id DESC
  LIMIT requested_limit OFFSET requested_offset;
END
$function$;

CREATE FUNCTION app_private.admin_create_tenant(
  requested_session_id uuid,
  requested_actor_user_id uuid,
  requested_idempotency_key uuid,
  requested_fingerprint text,
  requested_display_name text,
  requested_slug text,
  requested_timezone text,
  requested_locale text,
  requested_correlation_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  existing_fingerprint text;
  existing_resource_id uuid;
  created_tenant_id uuid;
BEGIN
  PERFORM app_private.require_nexi_admin_session(
    requested_session_id, requested_actor_user_id
  );
  IF length(btrim(requested_display_name)) NOT BETWEEN 1 AND 120
    OR requested_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    OR length(requested_slug) NOT BETWEEN 3 AND 63
    OR requested_slug IN (
      'www', 'admin', 'api', 'app', 'login', 'auth', 'support', 'status',
      'static', 'assets', 'mail', 'nexi', 'longhorn'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names
      WHERE name = requested_timezone
    )
    OR requested_locale !~ '^[a-z]{2}(?:-[A-Z]{2})?$'
  THEN
    RAISE EXCEPTION 'invalid tenant data' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.platform_idempotency_keys (
    actor_user_id, operation, idempotency_key, request_fingerprint
  )
  VALUES (
    requested_actor_user_id, 'tenant_create',
    requested_idempotency_key, requested_fingerprint
  )
  ON CONFLICT DO NOTHING;

  SELECT request_fingerprint, result_resource_id
  INTO existing_fingerprint, existing_resource_id
  FROM public.platform_idempotency_keys
  WHERE actor_user_id = requested_actor_user_id
    AND operation = 'tenant_create'
    AND idempotency_key = requested_idempotency_key
  FOR UPDATE;

  IF existing_fingerprint <> requested_fingerprint THEN
    RAISE EXCEPTION 'idempotency key conflict' USING ERRCODE = '22023';
  END IF;
  IF existing_resource_id IS NOT NULL THEN
    RETURN existing_resource_id;
  END IF;

  INSERT INTO public.tenants (
    display_name, slug, status, timezone, locale
  )
  VALUES (
    btrim(requested_display_name), requested_slug, 'draft',
    requested_timezone, requested_locale
  )
  RETURNING id INTO created_tenant_id;

  UPDATE public.platform_idempotency_keys
  SET result_resource_id = created_tenant_id
  WHERE actor_user_id = requested_actor_user_id
    AND operation = 'tenant_create'
    AND idempotency_key = requested_idempotency_key;

  INSERT INTO public.platform_audit_events (
    actor_user_id, tenant_id, action, resource_type, resource_id,
    outcome, correlation_id, new_state
  )
  VALUES (
    requested_actor_user_id, created_tenant_id, 'tenant_created', 'tenant',
    created_tenant_id::text, 'succeeded', requested_correlation_id,
    jsonb_build_object(
      'display_name', btrim(requested_display_name),
      'slug', requested_slug,
      'status', 'draft',
      'timezone', requested_timezone,
      'locale', requested_locale
    )
  );

  RETURN created_tenant_id;
END
$function$;

CREATE FUNCTION app_private.admin_update_tenant(
  requested_session_id uuid,
  requested_actor_user_id uuid,
  requested_tenant_id uuid,
  requested_expected_updated_at timestamptz,
  requested_display_name text,
  requested_slug text,
  requested_timezone text,
  requested_locale text,
  requested_correlation_id text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  current_tenant public.tenants%ROWTYPE;
  changed_at timestamptz;
BEGIN
  PERFORM app_private.require_nexi_admin_session(
    requested_session_id, requested_actor_user_id
  );
  SELECT * INTO current_tenant
  FROM public.tenants
  WHERE id = requested_tenant_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'P0002';
  END IF;
  IF date_trunc('milliseconds', current_tenant.updated_at)
    <> date_trunc('milliseconds', requested_expected_updated_at)
  THEN
    RAISE EXCEPTION 'tenant changed concurrently' USING ERRCODE = '40001';
  END IF;
  IF length(btrim(requested_display_name)) NOT BETWEEN 1 AND 120
    OR requested_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    OR length(requested_slug) NOT BETWEEN 3 AND 63
    OR requested_slug IN (
      'www', 'admin', 'api', 'app', 'login', 'auth', 'support', 'status',
      'static', 'assets', 'mail', 'nexi', 'longhorn'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names
      WHERE name = requested_timezone
    )
    OR requested_locale !~ '^[a-z]{2}(?:-[A-Z]{2})?$'
  THEN
    RAISE EXCEPTION 'invalid tenant data' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tenants
  SET
    display_name = btrim(requested_display_name),
    slug = requested_slug,
    timezone = requested_timezone,
    locale = requested_locale
  WHERE id = requested_tenant_id
  RETURNING updated_at INTO changed_at;

  INSERT INTO public.platform_audit_events (
    actor_user_id, tenant_id, action, resource_type, resource_id,
    outcome, correlation_id, previous_state, new_state
  )
  VALUES (
    requested_actor_user_id, requested_tenant_id, 'tenant_updated', 'tenant',
    requested_tenant_id::text, 'succeeded', requested_correlation_id,
    jsonb_build_object(
      'display_name', current_tenant.display_name,
      'slug', current_tenant.slug,
      'timezone', current_tenant.timezone,
      'locale', current_tenant.locale
    ),
    jsonb_build_object(
      'display_name', btrim(requested_display_name),
      'slug', requested_slug,
      'timezone', requested_timezone,
      'locale', requested_locale
    )
  );
  RETURN changed_at;
END
$function$;

CREATE FUNCTION app_private.admin_set_tenant_status(
  requested_session_id uuid,
  requested_actor_user_id uuid,
  requested_tenant_id uuid,
  requested_status text,
  requested_reason text,
  requested_correlation_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  current_status text;
BEGIN
  PERFORM app_private.require_nexi_admin_session(
    requested_session_id, requested_actor_user_id
  );
  IF requested_status NOT IN ('active', 'suspended')
    OR length(btrim(requested_reason)) NOT BETWEEN 5 AND 500
  THEN
    RAISE EXCEPTION 'invalid status change' USING ERRCODE = '22023';
  END IF;
  SELECT status INTO current_status
  FROM public.tenants
  WHERE id = requested_tenant_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'P0002';
  END IF;
  IF current_status = requested_status THEN
    RETURN false;
  END IF;
  IF requested_status = 'suspended'
    AND current_status NOT IN ('draft', 'active')
  THEN
    RAISE EXCEPTION 'tenant cannot be suspended' USING ERRCODE = '22023';
  END IF;
  IF requested_status = 'active' AND current_status NOT IN ('draft', 'suspended') THEN
    RAISE EXCEPTION 'tenant cannot be reactivated' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tenants SET status = requested_status
  WHERE id = requested_tenant_id;

  IF requested_status = 'suspended' THEN
    UPDATE public.auth_sessions
    SET
      revoked_at = COALESCE(revoked_at, transaction_timestamp()),
      revoke_reason = COALESCE(revoke_reason, 'tenant_suspended')
    WHERE audience = 'client_admin'
      AND active_tenant_id = requested_tenant_id
      AND revoked_at IS NULL;
  END IF;

  INSERT INTO public.platform_audit_events (
    actor_user_id, tenant_id, action, resource_type, resource_id,
    outcome, correlation_id, reason, previous_state, new_state
  )
  VALUES (
    requested_actor_user_id,
    requested_tenant_id,
    CASE
      WHEN requested_status = 'suspended' THEN 'tenant_suspended'
      WHEN current_status = 'draft' THEN 'tenant_activated'
      ELSE 'tenant_reactivated'
    END,
    'tenant',
    requested_tenant_id::text,
    'succeeded',
    requested_correlation_id,
    btrim(requested_reason),
    jsonb_build_object('status', current_status),
    jsonb_build_object('status', requested_status)
  );
  RETURN true;
END
$function$;

CREATE FUNCTION app_private.admin_reserve_invitation(
  requested_session_id uuid,
  requested_actor_user_id uuid,
  requested_tenant_id uuid,
  requested_idempotency_key uuid,
  requested_fingerprint text,
  requested_email text,
  requested_display_name text,
  requested_provider text,
  requested_expires_at timestamptz
)
RETURNS TABLE (
  invitation_id uuid,
  should_dispatch boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  existing_fingerprint text;
  existing_resource_id uuid;
  created_invitation_id uuid;
BEGIN
  PERFORM app_private.require_nexi_admin_session(
    requested_session_id, requested_actor_user_id
  );
  IF requested_provider NOT IN ('supabase', 'test')
    OR requested_email <> lower(btrim(requested_email))
    OR requested_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    OR length(btrim(requested_display_name)) NOT BETWEEN 1 AND 120
    OR requested_expires_at <= transaction_timestamp()
    OR NOT EXISTS (
      SELECT 1 FROM public.tenants
      WHERE id = requested_tenant_id AND deleted_at IS NULL
        AND status IN ('draft', 'active', 'suspended')
    )
  THEN
    RAISE EXCEPTION 'invalid invitation data' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS membership
    JOIN public.users AS account ON account.id = membership.user_id
    WHERE membership.tenant_id = requested_tenant_id
      AND membership.role = 'client_admin'
      AND account.email = requested_email
  ) THEN
    RAISE EXCEPTION 'membership already exists' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.platform_idempotency_keys (
    actor_user_id, operation, idempotency_key, request_fingerprint
  )
  VALUES (
    requested_actor_user_id, 'invitation_create',
    requested_idempotency_key, requested_fingerprint
  )
  ON CONFLICT DO NOTHING;

  SELECT request_fingerprint, result_resource_id
  INTO existing_fingerprint, existing_resource_id
  FROM public.platform_idempotency_keys
  WHERE actor_user_id = requested_actor_user_id
    AND operation = 'invitation_create'
    AND idempotency_key = requested_idempotency_key
  FOR UPDATE;

  IF existing_fingerprint <> requested_fingerprint THEN
    RAISE EXCEPTION 'idempotency key conflict' USING ERRCODE = '22023';
  END IF;
  IF existing_resource_id IS NOT NULL THEN
    RETURN QUERY SELECT existing_resource_id, false;
    RETURN;
  END IF;

  INSERT INTO public.tenant_invitations (
    tenant_id, email_normalized, display_name, status, provider,
    expires_at, invited_by_user_id
  )
  VALUES (
    requested_tenant_id, requested_email, btrim(requested_display_name),
    'failed', requested_provider, requested_expires_at, requested_actor_user_id
  )
  RETURNING id INTO created_invitation_id;

  UPDATE public.platform_idempotency_keys
  SET result_resource_id = created_invitation_id
  WHERE actor_user_id = requested_actor_user_id
    AND operation = 'invitation_create'
    AND idempotency_key = requested_idempotency_key;

  RETURN QUERY SELECT created_invitation_id, true;
END
$function$;

CREATE FUNCTION app_private.admin_complete_invitation(
  requested_session_id uuid,
  requested_actor_user_id uuid,
  requested_invitation_id uuid,
  requested_provider_reference text,
  requested_expires_at timestamptz,
  requested_correlation_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  invitation public.tenant_invitations%ROWTYPE;
BEGIN
  PERFORM app_private.require_nexi_admin_session(
    requested_session_id, requested_actor_user_id
  );
  SELECT * INTO invitation
  FROM public.tenant_invitations
  WHERE id = requested_invitation_id
  FOR UPDATE;
  IF NOT FOUND OR invitation.status <> 'failed'
    OR length(btrim(requested_provider_reference)) NOT BETWEEN 10 AND 255
    OR requested_expires_at <= transaction_timestamp()
  THEN
    RAISE EXCEPTION 'invitation cannot be completed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tenant_invitations
  SET
    status = 'pending',
    provider_reference = requested_provider_reference,
    expires_at = requested_expires_at,
    accepted_at = NULL,
    revoked_at = NULL
  WHERE id = requested_invitation_id;

  INSERT INTO public.platform_audit_events (
    actor_user_id, tenant_id, action, resource_type, resource_id,
    outcome, correlation_id, new_state
  )
  VALUES (
    requested_actor_user_id,
    invitation.tenant_id,
    CASE WHEN invitation.attempt_count = 1
      THEN 'invitation_created' ELSE 'invitation_resent' END,
    'invitation',
    invitation.id::text,
    'succeeded',
    requested_correlation_id,
    jsonb_build_object(
      'email', invitation.email_normalized,
      'status', 'pending',
      'expires_at', requested_expires_at,
      'attempt_count', invitation.attempt_count
    )
  );
END
$function$;

CREATE FUNCTION app_private.admin_fail_invitation(
  requested_session_id uuid,
  requested_actor_user_id uuid,
  requested_invitation_id uuid,
  requested_reason text,
  requested_correlation_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  invitation_tenant_id uuid;
BEGIN
  PERFORM app_private.require_nexi_admin_session(
    requested_session_id, requested_actor_user_id
  );
  SELECT tenant_id INTO invitation_tenant_id
  FROM public.tenant_invitations
  WHERE id = requested_invitation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.tenant_invitations
  SET status = 'failed', provider_reference = NULL
  WHERE id = requested_invitation_id;
  INSERT INTO public.platform_audit_events (
    actor_user_id, tenant_id, action, resource_type, resource_id,
    outcome, correlation_id, reason
  )
  VALUES (
    requested_actor_user_id, invitation_tenant_id, 'invitation_failed',
    'invitation', requested_invitation_id::text, 'failed',
    requested_correlation_id, left(btrim(requested_reason), 500)
  );
END
$function$;

CREATE FUNCTION app_private.admin_prepare_invitation_resend(
  requested_session_id uuid,
  requested_actor_user_id uuid,
  requested_invitation_id uuid,
  requested_expires_at timestamptz
)
RETURNS TABLE (
  invitation_email text,
  invitation_name text,
  invitation_provider text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  invitation public.tenant_invitations%ROWTYPE;
BEGIN
  PERFORM app_private.require_nexi_admin_session(
    requested_session_id, requested_actor_user_id
  );
  SELECT * INTO invitation
  FROM public.tenant_invitations
  WHERE id = requested_invitation_id
  FOR UPDATE;
  IF NOT FOUND
    OR invitation.status NOT IN ('pending', 'expired', 'failed')
    OR invitation.attempt_count >= 50
    OR requested_expires_at <= transaction_timestamp()
  THEN
    RAISE EXCEPTION 'invitation cannot be resent' USING ERRCODE = '22023';
  END IF;
  UPDATE public.tenant_invitations
  SET
    status = 'failed',
    provider_reference = NULL,
    expires_at = requested_expires_at,
    attempt_count = attempt_count + 1
  WHERE id = requested_invitation_id;
  RETURN QUERY SELECT
    invitation.email_normalized, invitation.display_name, invitation.provider;
END
$function$;

CREATE FUNCTION app_private.admin_revoke_invitation(
  requested_session_id uuid,
  requested_actor_user_id uuid,
  requested_invitation_id uuid,
  requested_reason text,
  requested_correlation_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  invitation public.tenant_invitations%ROWTYPE;
BEGIN
  PERFORM app_private.require_nexi_admin_session(
    requested_session_id, requested_actor_user_id
  );
  IF length(btrim(requested_reason)) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'revocation reason required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO invitation
  FROM public.tenant_invitations
  WHERE id = requested_invitation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation not found' USING ERRCODE = 'P0002';
  END IF;
  IF invitation.status = 'revoked' THEN
    RETURN false;
  END IF;
  IF invitation.status = 'accepted' THEN
    RAISE EXCEPTION 'accepted invitation cannot be revoked' USING ERRCODE = '22023';
  END IF;
  UPDATE public.tenant_invitations
  SET status = 'revoked', revoked_at = transaction_timestamp()
  WHERE id = requested_invitation_id;
  INSERT INTO public.platform_audit_events (
    actor_user_id, tenant_id, action, resource_type, resource_id,
    outcome, correlation_id, reason, previous_state, new_state
  )
  VALUES (
    requested_actor_user_id, invitation.tenant_id, 'invitation_revoked',
    'invitation', invitation.id::text, 'succeeded', requested_correlation_id,
    btrim(requested_reason),
    jsonb_build_object('status', invitation.status),
    jsonb_build_object('status', 'revoked')
  );
  RETURN true;
END
$function$;

CREATE FUNCTION app_private.accept_tenant_invitation(
  requested_provider text,
  requested_provider_reference text,
  requested_provider_subject text,
  requested_email text,
  requested_display_name text,
  requested_correlation_id text
)
RETURNS TABLE (
  accepted_tenant_id uuid,
  accepted_user_id uuid,
  accepted_membership_id uuid,
  already_accepted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  invitation public.tenant_invitations%ROWTYPE;
  resolved_user_id uuid;
  resolved_membership_id uuid;
  membership_was_present boolean;
BEGIN
  SELECT * INTO invitation
  FROM public.tenant_invitations
  WHERE provider = requested_provider
    AND provider_reference = requested_provider_reference
    AND email_normalized = requested_email
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation not found' USING ERRCODE = 'P0002';
  END IF;
  IF invitation.status = 'accepted' THEN
    SELECT membership.id, membership.user_id
    INTO resolved_membership_id, resolved_user_id
    FROM public.tenant_memberships AS membership
    JOIN public.users AS account ON account.id = membership.user_id
    WHERE membership.tenant_id = invitation.tenant_id
      AND account.email = invitation.email_normalized
      AND membership.role = 'client_admin'
    LIMIT 1;
    RETURN QUERY SELECT
      invitation.tenant_id, resolved_user_id, resolved_membership_id, true;
    RETURN;
  END IF;
  IF invitation.status <> 'pending'
    OR invitation.expires_at <= transaction_timestamp()
  THEN
    RAISE EXCEPTION 'invitation is not active' USING ERRCODE = '42501';
  END IF;

  SELECT identity.user_id INTO resolved_user_id
  FROM public.auth_identities AS identity
  WHERE identity.provider = requested_provider
    AND identity.provider_subject = requested_provider_subject;

  IF resolved_user_id IS NULL THEN
    SELECT id INTO resolved_user_id
    FROM public.users
    WHERE email = requested_email AND deleted_at IS NULL;
  END IF;

  IF resolved_user_id IS NULL THEN
    INSERT INTO public.users (email, display_name, status)
    VALUES (requested_email, invitation.display_name, 'active')
    RETURNING id INTO resolved_user_id;
  END IF;

  INSERT INTO public.auth_identities (
    user_id, provider, provider_subject, provider_email
  )
  VALUES (
    resolved_user_id, requested_provider,
    requested_provider_subject, requested_email
  )
  ON CONFLICT (provider, provider_subject) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.auth_identities
    WHERE user_id = resolved_user_id
      AND provider = requested_provider
      AND provider_subject = requested_provider_subject
      AND provider_email = requested_email
  ) THEN
    RAISE EXCEPTION 'identity conflict' USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE tenant_id = invitation.tenant_id
      AND user_id = resolved_user_id
  ) INTO membership_was_present;

  INSERT INTO public.tenant_memberships (
    tenant_id, user_id, status, role
  )
  VALUES (
    invitation.tenant_id, resolved_user_id, 'active', 'client_admin'
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE
  SET status = 'active', role = 'client_admin'
  RETURNING id INTO resolved_membership_id;

  UPDATE public.tenant_invitations
  SET status = 'accepted', accepted_at = transaction_timestamp()
  WHERE id = invitation.id;

  INSERT INTO public.platform_audit_events (
    actor_user_id, tenant_id, action, resource_type, resource_id,
    outcome, correlation_id, previous_state, new_state
  )
  VALUES (
    resolved_user_id, invitation.tenant_id,
    'invitation_accepted', 'invitation', invitation.id::text,
    'succeeded', requested_correlation_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'accepted')
  );

  INSERT INTO public.platform_audit_events (
    actor_user_id, tenant_id, action, resource_type, resource_id,
    outcome, correlation_id, new_state
  )
  VALUES (
    resolved_user_id, invitation.tenant_id,
    CASE WHEN membership_was_present
      THEN 'membership_reactivated' ELSE 'membership_created' END,
    'membership', resolved_membership_id::text, 'succeeded',
    requested_correlation_id,
    jsonb_build_object(
      'status', 'active', 'role', 'client_admin'
    )
  );

  RETURN QUERY SELECT
    invitation.tenant_id, resolved_user_id, resolved_membership_id, false;
END
$function$;

CREATE FUNCTION app_private.admin_set_membership_status(
  requested_session_id uuid,
  requested_actor_user_id uuid,
  requested_membership_id uuid,
  requested_status text,
  requested_reason text,
  requested_correlation_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  membership public.tenant_memberships%ROWTYPE;
BEGIN
  PERFORM app_private.require_nexi_admin_session(
    requested_session_id, requested_actor_user_id
  );
  IF requested_status NOT IN ('active', 'disabled')
    OR length(btrim(requested_reason)) NOT BETWEEN 5 AND 500
  THEN
    RAISE EXCEPTION 'invalid membership status change' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO membership
  FROM public.tenant_memberships
  WHERE id = requested_membership_id AND role = 'client_admin'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found' USING ERRCODE = 'P0002';
  END IF;
  IF membership.status = requested_status THEN
    RETURN false;
  END IF;
  UPDATE public.tenant_memberships
  SET status = requested_status
  WHERE id = requested_membership_id;
  INSERT INTO public.platform_audit_events (
    actor_user_id, tenant_id, action, resource_type, resource_id,
    outcome, correlation_id, reason, previous_state, new_state
  )
  VALUES (
    requested_actor_user_id, membership.tenant_id,
    CASE WHEN requested_status = 'disabled'
      THEN 'membership_disabled' ELSE 'membership_reactivated' END,
    'membership', membership.id::text, 'succeeded',
    requested_correlation_id, btrim(requested_reason),
    jsonb_build_object('status', membership.status),
    jsonb_build_object('status', requested_status)
  );
  RETURN true;
END
$function$;

CREATE FUNCTION app_private.record_admin_access_denied(
  requested_actor_user_id uuid,
  requested_correlation_id text,
  requested_reason text,
  requested_metadata jsonb
)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  INSERT INTO public.platform_audit_events (
    actor_user_id, action, resource_type, outcome, correlation_id,
    reason, metadata
  )
  VALUES (
    CASE WHEN EXISTS (
      SELECT 1 FROM public.users WHERE id = requested_actor_user_id
    ) THEN requested_actor_user_id ELSE NULL END,
    'admin_access_denied',
    'admin_route',
    'blocked',
    requested_correlation_id,
    left(COALESCE(requested_reason, 'access denied'), 500),
    COALESCE(requested_metadata, '{}'::jsonb)
  )
  RETURNING id
$function$;

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
      AND active_tenant_id = OLD.tenant_id
      AND revoked_at IS NULL;
  END IF;
  RETURN NULL;
END
$function$;

ALTER TABLE public.auth_rate_limits
DROP CONSTRAINT auth_rate_limits_scope_valid;

ALTER TABLE public.auth_rate_limits
ADD CONSTRAINT auth_rate_limits_scope_valid CHECK (
  scope IN (
    'login_ip', 'login_identity', 'recovery_ip', 'recovery_identity',
    'recovery_verify_ip', 'password_reset_ip', 'tenant_selection',
    'admin_mutation', 'invitation_acceptance'
  )
);

REVOKE ALL ON FUNCTION app_private.require_nexi_admin_session(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.admin_dashboard(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.admin_list_tenants(uuid, uuid, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.admin_get_tenant(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.admin_list_memberships(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.admin_list_invitations(uuid, uuid, uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.admin_list_audit_events(uuid, uuid, text, uuid, text, timestamptz, timestamptz, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.admin_create_tenant(uuid, uuid, uuid, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.admin_update_tenant(uuid, uuid, uuid, timestamptz, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.admin_set_tenant_status(uuid, uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.admin_reserve_invitation(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.admin_complete_invitation(uuid, uuid, uuid, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.admin_fail_invitation(uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.admin_prepare_invitation_resend(uuid, uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.admin_revoke_invitation(uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.accept_tenant_invitation(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.admin_set_membership_status(uuid, uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.record_admin_access_denied(uuid, text, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_private.admin_dashboard(uuid, uuid) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.admin_list_tenants(uuid, uuid, text, text, text, integer, integer) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.admin_get_tenant(uuid, uuid, uuid) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.admin_list_memberships(uuid, uuid, uuid) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.admin_list_invitations(uuid, uuid, uuid, text, integer, integer) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.admin_list_audit_events(uuid, uuid, text, uuid, text, timestamptz, timestamptz, text, integer, integer) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.admin_create_tenant(uuid, uuid, uuid, text, text, text, text, text, text) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.admin_update_tenant(uuid, uuid, uuid, timestamptz, text, text, text, text, text) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.admin_set_tenant_status(uuid, uuid, uuid, text, text, text) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.admin_reserve_invitation(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.admin_complete_invitation(uuid, uuid, uuid, text, timestamptz, text) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.admin_fail_invitation(uuid, uuid, uuid, text, text) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.admin_prepare_invitation_resend(uuid, uuid, uuid, timestamptz) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.admin_revoke_invitation(uuid, uuid, uuid, text, text) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.accept_tenant_invitation(text, text, text, text, text, text) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.admin_set_membership_status(uuid, uuid, uuid, text, text, text) TO nexi_app;
GRANT EXECUTE ON FUNCTION app_private.record_admin_access_denied(uuid, text, text, jsonb) TO nexi_app;
