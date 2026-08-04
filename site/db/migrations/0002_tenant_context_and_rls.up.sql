CREATE SCHEMA IF NOT EXISTS app_context AUTHORIZATION nexi_migrator;
CREATE SCHEMA IF NOT EXISTS app_private AUTHORIZATION nexi_migrator;

REVOKE ALL ON SCHEMA app_context FROM PUBLIC;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_context TO nexi_app;
GRANT USAGE ON SCHEMA app_private TO nexi_app;

CREATE FUNCTION app_context.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT nullif(current_setting('app.current_tenant_id', true), '')::uuid
$function$;

CREATE FUNCTION app_context.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT nullif(current_setting('app.current_user_id', true), '')::uuid
$function$;

CREATE FUNCTION app_context.current_correlation_id()
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT nullif(current_setting('app.current_correlation_id', true), '')
$function$;

REVOKE ALL ON FUNCTION app_context.current_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_context.current_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_context.current_correlation_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_context.current_tenant_id() TO nexi_app;
GRANT EXECUTE ON FUNCTION app_context.current_user_id() TO nexi_app;
GRANT EXECUTE ON FUNCTION app_context.current_correlation_id() TO nexi_app;

CREATE FUNCTION app_private.current_actor_is_active_member()
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

REVOKE ALL ON FUNCTION app_private.current_actor_is_active_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.current_actor_is_active_member() TO nexi_app;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_select_current
ON public.tenants
FOR SELECT
TO nexi_app
USING (
  id = app_context.current_tenant_id()
  AND app_private.current_actor_is_active_member()
);

CREATE POLICY users_select_current_tenant
ON public.users
FOR SELECT
TO nexi_app
USING (
  app_private.current_actor_is_active_member()
  AND EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS membership
    WHERE membership.tenant_id = app_context.current_tenant_id()
      AND membership.user_id = users.id
      AND membership.status = 'active'
  )
);

CREATE POLICY memberships_select_current
ON public.tenant_memberships
FOR SELECT
TO nexi_app
USING (
  tenant_id = app_context.current_tenant_id()
  AND app_private.current_actor_is_active_member()
);

CREATE POLICY memberships_insert_self
ON public.tenant_memberships
FOR INSERT
TO nexi_app
WITH CHECK (
  tenant_id = app_context.current_tenant_id()
  AND user_id = app_context.current_user_id()
  AND app_private.current_actor_is_active_member()
);

CREATE POLICY memberships_update_self
ON public.tenant_memberships
FOR UPDATE
TO nexi_app
USING (
  tenant_id = app_context.current_tenant_id()
  AND user_id = app_context.current_user_id()
  AND app_private.current_actor_is_active_member()
)
WITH CHECK (
  tenant_id = app_context.current_tenant_id()
  AND user_id = app_context.current_user_id()
  AND app_private.current_actor_is_active_member()
);

CREATE POLICY memberships_delete_self
ON public.tenant_memberships
FOR DELETE
TO nexi_app
USING (
  tenant_id = app_context.current_tenant_id()
  AND user_id = app_context.current_user_id()
  AND app_private.current_actor_is_active_member()
);

REVOKE ALL ON TABLE public.tenants FROM PUBLIC, nexi_app;
REVOKE ALL ON TABLE public.users FROM PUBLIC, nexi_app;
REVOKE ALL ON TABLE public.tenant_memberships FROM PUBLIC, nexi_app;

GRANT SELECT ON TABLE public.tenants TO nexi_app;
GRANT SELECT ON TABLE public.users TO nexi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_memberships TO nexi_app;
