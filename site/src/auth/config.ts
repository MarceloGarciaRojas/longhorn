import {
  APP_ENVIRONMENTS,
  isDeployedEnvironment,
  type AppEnvironment,
  type EnvironmentSource,
} from "@/src/config/app-config";
import { AuthConfigurationError } from "./errors";
import type { AuthProviderName } from "./types";

export interface AuthConfig {
  environment: AppEnvironment;
  provider: AuthProviderName;
  publicUrl: string;
  cookieName: string;
  recoveryCookieName: string;
  cookieSecure: boolean;
  sessionTtlSeconds: number;
  adminSessionTtlSeconds: number;
  securityPepper: string;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  supabaseSecretKey?: string;
  invitationTtlSeconds: number;
}

const ENVIRONMENTS = new Set<AppEnvironment>(APP_ENVIRONMENTS);

function readInteger(
  source: EnvironmentSource,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = source[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new AuthConfigurationError(
      name,
      `expected an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function readEnvironment(source: EnvironmentSource): AppEnvironment {
  const value = (source.APP_ENV?.trim() || "local") as AppEnvironment;
  if (!ENVIRONMENTS.has(value)) {
    throw new AuthConfigurationError("APP_ENV", "unsupported environment");
  }
  return value;
}

function readPublicUrl(source: EnvironmentSource): string {
  const raw = source.APP_URL?.trim() || "http://localhost:3000";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("unsupported protocol");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new AuthConfigurationError("APP_URL", "expected an HTTP(S) URL");
  }
}

export function loadAuthConfig(
  source: EnvironmentSource = process.env,
): Readonly<AuthConfig> {
  const environment = readEnvironment(source);
  const provider = (source.AUTH_PROVIDER?.trim() ||
    (environment === "local" || environment === "test"
      ? "test"
      : "supabase")) as AuthProviderName;

  if (provider !== "supabase" && provider !== "test") {
    throw new AuthConfigurationError(
      "AUTH_PROVIDER",
      "expected supabase or test",
    );
  }
  if (
    provider === "test" &&
    environment !== "local" &&
    environment !== "test"
  ) {
    throw new AuthConfigurationError(
      "AUTH_PROVIDER",
      "the test provider is forbidden outside local and test",
    );
  }

  const securityPepper = source.AUTH_SECURITY_PEPPER?.trim();
  if (
    !securityPepper &&
    isDeployedEnvironment(environment)
  ) {
    throw new AuthConfigurationError(
      "AUTH_SECURITY_PEPPER",
      `it is required in ${environment}`,
    );
  }

  const supabaseUrl = source.SUPABASE_URL?.trim();
  const supabasePublishableKey = source.SUPABASE_PUBLISHABLE_KEY?.trim();
  const supabaseSecretKey = source.SUPABASE_SECRET_KEY?.trim();
  if (provider === "supabase" && (!supabaseUrl || !supabasePublishableKey)) {
    throw new AuthConfigurationError(
      "SUPABASE_URL",
      "Supabase URL and publishable key are required",
    );
  }
  if (provider === "supabase" && !supabaseSecretKey) {
    throw new AuthConfigurationError(
      "SUPABASE_SECRET_KEY",
      "it is required for server-side invitations",
    );
  }

  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      if (url.protocol !== "https:" && environment !== "local") {
        throw new Error("HTTPS required");
      }
    } catch {
      throw new AuthConfigurationError(
        "SUPABASE_URL",
        "expected a valid HTTPS URL",
      );
    }
  }

  const cookieSecure = isDeployedEnvironment(environment);

  return Object.freeze({
    environment,
    provider,
    publicUrl: readPublicUrl(source),
    cookieName: cookieSecure ? "__Host-nexi_session" : "nexi_session",
    recoveryCookieName: cookieSecure
      ? "__Host-nexi_recovery"
      : "nexi_recovery",
    cookieSecure,
    sessionTtlSeconds: readInteger(
      source,
      "AUTH_SESSION_TTL_SECONDS",
      8 * 60 * 60,
      15 * 60,
      7 * 24 * 60 * 60,
    ),
    adminSessionTtlSeconds: readInteger(
      source,
      "AUTH_ADMIN_SESSION_TTL_SECONDS",
      2 * 60 * 60,
      15 * 60,
      24 * 60 * 60,
    ),
    securityPepper: securityPepper || "local-test-only-pepper",
    supabaseUrl,
    supabasePublishableKey,
    supabaseSecretKey,
    invitationTtlSeconds: readInteger(
      source,
      "AUTH_INVITATION_TTL_SECONDS",
      24 * 60 * 60,
      15 * 60,
      7 * 24 * 60 * 60,
    ),
  });
}
