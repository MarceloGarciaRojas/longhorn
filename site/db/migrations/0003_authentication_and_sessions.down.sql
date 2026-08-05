REVOKE ALL ON FUNCTION app_private.write_auth_audit_event(uuid, uuid, text, text, text, text, text, jsonb) FROM nexi_app;
REVOKE ALL ON FUNCTION app_private.consume_auth_rate_limit(text, bytea, integer, integer, integer) FROM nexi_app;
REVOKE ALL ON FUNCTION app_private.rotate_auth_session_tenant(bytea, bytea, uuid, timestamptz, bytea, bytea) FROM nexi_app;
REVOKE ALL ON FUNCTION app_private.revoke_auth_session(bytea, text) FROM nexi_app;
REVOKE ALL ON FUNCTION app_private.read_auth_session(bytea) FROM nexi_app;
REVOKE ALL ON FUNCTION app_private.create_auth_session(bytea, uuid, text, text, uuid, timestamptz, bytea, bytea) FROM nexi_app;
REVOKE ALL ON FUNCTION app_private.is_active_platform_staff(uuid) FROM nexi_app;
REVOKE ALL ON FUNCTION app_private.list_auth_tenants(uuid) FROM nexi_app;
REVOKE ALL ON FUNCTION app_private.resolve_auth_identity(text, text, text) FROM nexi_app;

DROP FUNCTION IF EXISTS app_private.write_auth_audit_event(uuid, uuid, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS app_private.consume_auth_rate_limit(text, bytea, integer, integer, integer);
DROP FUNCTION IF EXISTS app_private.rotate_auth_session_tenant(bytea, bytea, uuid, timestamptz, bytea, bytea);
DROP FUNCTION IF EXISTS app_private.revoke_auth_session(bytea, text);
DROP FUNCTION IF EXISTS app_private.read_auth_session(bytea);
DROP FUNCTION IF EXISTS app_private.create_auth_session(bytea, uuid, text, text, uuid, timestamptz, bytea, bytea);
DROP FUNCTION IF EXISTS app_private.is_active_platform_staff(uuid);
DROP FUNCTION IF EXISTS app_private.list_auth_tenants(uuid);
DROP FUNCTION IF EXISTS app_private.resolve_auth_identity(text, text, text);

DROP TABLE IF EXISTS public.auth_rate_limits;
DROP TABLE IF EXISTS public.auth_audit_events;
DROP TABLE IF EXISTS public.auth_sessions;
DROP TABLE IF EXISTS public.platform_staff;
DROP TABLE IF EXISTS public.auth_identities;
