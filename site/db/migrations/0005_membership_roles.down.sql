DROP TRIGGER IF EXISTS tenant_memberships_revoke_sessions
ON public.tenant_memberships;

DROP FUNCTION IF EXISTS app_private.revoke_sessions_on_membership_change();

CREATE OR REPLACE FUNCTION app_private.list_auth_tenants(requested_user_id uuid)
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

ALTER TABLE public.tenant_memberships
DROP CONSTRAINT tenant_memberships_role_valid;

ALTER TABLE public.tenant_memberships
DROP COLUMN role;
