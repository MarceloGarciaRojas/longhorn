import { loadAuthConfig } from "@/src/auth/config";
import { loadAppConfig, type EnvironmentSource } from "@/src/config/app-config";
import { readDatabaseUrl } from "@/src/db/config";
import { loadMediaConfig } from "@/src/media/config";

export class AlphaConfigurationError extends Error {
  constructor(
    readonly variableName: string,
    reason: string,
  ) {
    super(`Invalid alpha configuration for ${variableName}: ${reason}`);
    this.name = "AlphaConfigurationError";
  }
}

function required(source: EnvironmentSource, name: string): string {
  const value = source[name]?.trim();
  if (!value) throw new AlphaConfigurationError(name, "it is required");
  return value;
}

function exact(source: EnvironmentSource, name: string, expected: string): string {
  const value = required(source, name);
  if (value !== expected) {
    throw new AlphaConfigurationError(name, `expected ${expected}`);
  }
  return value;
}

export interface AlphaConfig {
  environment: "alpha";
  publicUrl: string;
  deployTarget: "cloudflare-workers";
  cloudflareAccountId: string;
  hyperdriveId: string;
  mediaBucket: string;
  databaseAdminUrl: string;
  databaseMigrationUrl: string;
  databaseApplicationUrl: string;
}

export function loadAlphaConfig(
  source: EnvironmentSource = process.env,
): Readonly<AlphaConfig> {
  exact(source, "APP_ENV", "alpha");
  exact(source, "ALPHA_RESOURCE_GUARD", "nexi-alpha");
  exact(source, "ALPHA_DEPLOY_TARGET", "cloudflare-workers");
  if (source.CI === "true" || source.GITHUB_ACTIONS === "true") {
    throw new AlphaConfigurationError(
      "APP_ENV",
      "alpha resources are forbidden from CI",
    );
  }
  if (source.TEST_DATABASE_URL?.trim()) {
    throw new AlphaConfigurationError(
      "TEST_DATABASE_URL",
      "test credentials must not coexist with alpha operations",
    );
  }

  const app = loadAppConfig(source);
  const auth = loadAuthConfig(source);
  const media = loadMediaConfig(source);
  if (auth.provider !== "supabase" || !auth.cookieSecure) {
    throw new AlphaConfigurationError("AUTH_PROVIDER", "Supabase with secure cookies is required");
  }
  if (auth.securityPepper.length < 32) {
    throw new AlphaConfigurationError(
      "AUTH_SECURITY_PEPPER",
      "expected at least 32 characters",
    );
  }
  if (auth.supabasePublishableKey === auth.supabaseSecretKey) {
    throw new AlphaConfigurationError(
      "SUPABASE_SECRET_KEY",
      "must differ from the publishable key",
    );
  }
  if (media.provider !== "supabase") {
    throw new AlphaConfigurationError(
      "MEDIA_STORAGE_PROVIDER",
      "persistent Supabase Storage is required",
    );
  }

  const cloudflareAccountId = required(source, "CLOUDFLARE_ACCOUNT_ID");
  const hyperdriveId = required(source, "CLOUDFLARE_HYPERDRIVE_ID");
  if (!/^[0-9a-f]{32}$/i.test(cloudflareAccountId)) {
    throw new AlphaConfigurationError(
      "CLOUDFLARE_ACCOUNT_ID",
      "expected a 32-character identifier",
    );
  }
  if (!/^[0-9a-f]{32}$/i.test(hyperdriveId)) {
    throw new AlphaConfigurationError(
      "CLOUDFLARE_HYPERDRIVE_ID",
      "expected a 32-character identifier",
    );
  }
  const mediaBucket = required(source, "MEDIA_SUPABASE_BUCKET");
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(mediaBucket)) {
    throw new AlphaConfigurationError(
      "MEDIA_SUPABASE_BUCKET",
      "expected a valid lowercase bucket name",
    );
  }

  return Object.freeze({
    environment: "alpha",
    publicUrl: app.publicUrl,
    deployTarget: "cloudflare-workers",
    cloudflareAccountId,
    hyperdriveId,
    mediaBucket,
    databaseAdminUrl: readDatabaseUrl("admin", source),
    databaseMigrationUrl: readDatabaseUrl("migration", source),
    databaseApplicationUrl: readDatabaseUrl("application", source),
  });
}
