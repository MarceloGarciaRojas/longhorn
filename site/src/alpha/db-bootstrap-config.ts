import type { EnvironmentSource } from "@/src/config/app-config";
import { readDatabaseUrl } from "@/src/db/config";

import { AlphaConfigurationError } from "./config";

export interface AlphaDatabaseBootstrapConfig {
  environment: "alpha";
  resourceGuard: "nexi-alpha";
  databaseAdminUrl: string;
  applicationPassword: string;
  migratorPassword: string;
}

export const ALPHA_DATABASE_PROVISIONED_MESSAGE =
  "Alpha PostgreSQL roles provisioned without exposing credentials.";

export const ALPHA_DATABASE_PROVISIONING_SQL = `
  DO $provision$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='nexi_migrator'
    ) THEN
      CREATE ROLE nexi_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
        NOINHERIT NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='nexi_app'
    ) THEN
      CREATE ROLE nexi_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
        NOINHERIT NOBYPASSRLS;
    END IF;
    EXECUTE format(
      'ALTER ROLE nexi_migrator PASSWORD %L',
      current_setting('nexi.migrator_password')
    );
    EXECUTE format(
      'ALTER ROLE nexi_app PASSWORD %L',
      current_setting('nexi.app_password')
    );
    EXECUTE format(
      'GRANT CONNECT, TEMPORARY, CREATE ON DATABASE %I TO nexi_migrator',
      current_database()
    );
    EXECUTE format(
      'GRANT CONNECT ON DATABASE %I TO nexi_app',
      current_database()
    );
    EXECUTE format(
      'REVOKE CREATE ON DATABASE %I FROM nexi_app',
      current_database()
    );
  END
  $provision$;

  ALTER ROLE nexi_migrator SET statement_timeout='30s';
  ALTER ROLE nexi_app SET statement_timeout='5s';
  ALTER ROLE nexi_app SET idle_in_transaction_session_timeout='10s';
  ALTER ROLE nexi_app SET row_security='on';
  REVOKE ALL ON SCHEMA public FROM PUBLIC;
  GRANT USAGE, CREATE ON SCHEMA public TO nexi_migrator;
  GRANT USAGE ON SCHEMA public TO nexi_app;
`;

function exact(source: EnvironmentSource, name: string, expected: string): void {
  if (source[name]?.trim() !== expected) {
    throw new AlphaConfigurationError(name, `expected ${expected}`);
  }
}

function password(source: EnvironmentSource, name: string): string {
  const value = source[name]?.trim();
  if (!value || value.length < 32) {
    throw new AlphaConfigurationError(name, "expected at least 32 characters");
  }
  return value;
}

function assertSupabaseAlphaTarget(
  source: EnvironmentSource,
  databaseAdminUrl: string,
): void {
  const supabaseValue = source.SUPABASE_URL?.trim();
  if (!supabaseValue) {
    throw new AlphaConfigurationError(
      "SUPABASE_URL",
      "it is required to identify the Alpha database target",
    );
  }

  try {
    const supabaseUrl = new URL(supabaseValue);
    const projectMatch = /^([a-z0-9]+)\.supabase\.co$/i.exec(
      supabaseUrl.hostname,
    );
    if (supabaseUrl.protocol !== "https:" || !projectMatch) {
      throw new Error("invalid Supabase project URL");
    }

    const projectRef = projectMatch[1].toLowerCase();
    const databaseUrl = new URL(databaseAdminUrl);
    const databaseHost = databaseUrl.hostname.toLowerCase();
    const databaseRole = decodeURIComponent(databaseUrl.username).toLowerCase();
    const directTarget = databaseHost === `db.${projectRef}.supabase.co`;
    const poolerTarget =
      databaseHost.endsWith(".pooler.supabase.com") &&
      databaseRole.endsWith(`.${projectRef}`);
    if (!directTarget && !poolerTarget) {
      throw new Error("database target does not match Supabase project");
    }
  } catch {
    throw new AlphaConfigurationError(
      "DATABASE_ADMIN_URL",
      "must match the Supabase project identified by SUPABASE_URL",
    );
  }
}

export function loadAlphaDatabaseBootstrapConfig(
  source: EnvironmentSource = process.env,
): Readonly<AlphaDatabaseBootstrapConfig> {
  exact(source, "APP_ENV", "alpha");
  exact(source, "ALPHA_RESOURCE_GUARD", "nexi-alpha");
  if (source.CI === "true" || source.GITHUB_ACTIONS === "true") {
    throw new AlphaConfigurationError(
      "APP_ENV",
      "Alpha provisioning is forbidden from CI",
    );
  }
  if (source.TEST_DATABASE_URL?.trim()) {
    throw new AlphaConfigurationError(
      "TEST_DATABASE_URL",
      "test credentials must not coexist with Alpha provisioning",
    );
  }

  const databaseAdminUrl = readDatabaseUrl("admin", source);
  assertSupabaseAlphaTarget(source, databaseAdminUrl);
  const applicationPassword = password(source, "ALPHA_APP_DB_PASSWORD");
  const migratorPassword = password(source, "ALPHA_MIGRATOR_DB_PASSWORD");
  if (applicationPassword === migratorPassword) {
    throw new AlphaConfigurationError(
      "ALPHA_MIGRATOR_DB_PASSWORD",
      "must differ from ALPHA_APP_DB_PASSWORD",
    );
  }

  return Object.freeze({
    environment: "alpha",
    resourceGuard: "nexi-alpha",
    databaseAdminUrl,
    applicationPassword,
    migratorPassword,
  });
}
