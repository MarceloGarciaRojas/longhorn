ALTER TABLE public.tenant_memberships
ADD COLUMN role text NOT NULL DEFAULT 'client_admin';

ALTER TABLE public.tenant_memberships
ADD CONSTRAINT tenant_memberships_role_valid CHECK (
  role IN ('client_admin')
);

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
    AND membership.role = 'client_admin'
    AND membership.status = 'active'
    AND tenant.status = 'active'
    AND tenant.deleted_at IS NULL
    AND account.status = 'active'
    AND account.deleted_at IS NULL
  ORDER BY tenant.display_name, tenant.id
$function$;

CREATE FUNCTION app_private.revoke_sessions_on_membership_change()
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
      AND revoked_at IS NULL;
  END IF;
  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION app_private.revoke_sessions_on_membership_change() FROM PUBLIC;

CREATE TRIGGER tenant_memberships_revoke_sessions
AFTER UPDATE OR DELETE ON public.tenant_memberships
FOR EACH ROW
EXECUTE FUNCTION app_private.revoke_sessions_on_membership_change();
