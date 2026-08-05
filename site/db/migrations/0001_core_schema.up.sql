CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  NEW.updated_at = transaction_timestamp();
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  timezone text NOT NULL DEFAULT 'America/Santiago',
  locale text NOT NULL DEFAULT 'es-CL',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  deleted_at timestamptz,
  CONSTRAINT tenants_slug_unique UNIQUE (slug),
  CONSTRAINT tenants_slug_format CHECK (
    length(slug) BETWEEN 3 AND 63
    AND slug = lower(btrim(slug))
    AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  CONSTRAINT tenants_display_name_valid CHECK (
    length(btrim(display_name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT tenants_status_valid CHECK (
    status IN ('active', 'suspended', 'archived')
  ),
  CONSTRAINT tenants_timezone_valid CHECK (
    length(btrim(timezone)) BETWEEN 1 AND 64
  ),
  CONSTRAINT tenants_locale_valid CHECK (
    locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'
  )
);

CREATE TRIGGER tenants_set_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  deleted_at timestamptz,
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_email_normalized CHECK (
    email = lower(btrim(email))
    AND length(email) BETWEEN 3 AND 254
    AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  CONSTRAINT users_display_name_valid CHECK (
    length(btrim(display_name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT users_status_valid CHECK (
    status IN ('active', 'disabled')
  )
);

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT tenant_memberships_tenant_user_unique UNIQUE (tenant_id, user_id),
  CONSTRAINT tenant_memberships_status_valid CHECK (
    status IN ('active', 'disabled')
  ),
  CONSTRAINT tenant_memberships_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT tenant_memberships_user_fk
    FOREIGN KEY (user_id)
    REFERENCES public.users (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX tenant_memberships_user_tenant_idx
ON public.tenant_memberships (user_id, tenant_id);

CREATE TRIGGER tenant_memberships_set_updated_at
BEFORE UPDATE ON public.tenant_memberships
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
