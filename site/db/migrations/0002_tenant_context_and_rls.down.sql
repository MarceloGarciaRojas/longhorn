REVOKE ALL ON TABLE public.tenant_memberships FROM nexi_app;
REVOKE ALL ON TABLE public.users FROM nexi_app;
REVOKE ALL ON TABLE public.tenants FROM nexi_app;

DROP POLICY IF EXISTS memberships_delete_self ON public.tenant_memberships;
DROP POLICY IF EXISTS memberships_update_self ON public.tenant_memberships;
DROP POLICY IF EXISTS memberships_insert_self ON public.tenant_memberships;
DROP POLICY IF EXISTS memberships_select_current ON public.tenant_memberships;
DROP POLICY IF EXISTS users_select_current_tenant ON public.users;
DROP POLICY IF EXISTS tenants_select_current ON public.tenants;

ALTER TABLE public.tenant_memberships DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants DISABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS app_private.current_actor_is_active_member();
DROP FUNCTION IF EXISTS app_context.current_correlation_id();
DROP FUNCTION IF EXISTS app_context.current_user_id();
DROP FUNCTION IF EXISTS app_context.current_tenant_id();
DROP SCHEMA IF EXISTS app_private;
DROP SCHEMA IF EXISTS app_context;
