export const APP_ENVIRONMENTS = [
  "local",
  "test",
  "development",
  "staging",
  "production",
] as const;

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AppConfig {
  applicationName: "nexi";
  serviceName: "nexi-web";
  environment: AppEnvironment;
  publicUrl: string;
  version: string;
  commitSha?: string;
  logLevel: LogLevel;
  siteDeletionGraceHours: 24 | 48;
}

export type EnvironmentSource = Readonly<
  Record<string, string | undefined>
>;

export class AppConfigError extends Error {
  readonly variableName: string;

  constructor(variableName: string, reason: string) {
    super(`Invalid application configuration for ${variableName}: ${reason}`);
    this.name = "AppConfigError";
    this.variableName = variableName;
  }
}

function readEnum<T extends readonly string[]>(
  source: EnvironmentSource,
  variableName: string,
  allowedValues: T,
  fallback: T[number],
): T[number] {
  const value = source[variableName]?.trim() || fallback;
  if (!allowedValues.includes(value)) {
    throw new AppConfigError(
      variableName,
      `expected one of ${allowedValues.join(", ")}`,
    );
  }
  return value as T[number];
}

function readPublicUrl(
  source: EnvironmentSource,
  environment: AppEnvironment,
): string {
  const value = source.APP_URL?.trim();
  if (!value && (environment === "staging" || environment === "production")) {
    throw new AppConfigError("APP_URL", `it is required in ${environment}`);
  }

  const candidate = value || "http://localhost:3000";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new AppConfigError("APP_URL", "expected a valid HTTP(S) URL");
  }
}

function readDeletionGraceHours(
  source: EnvironmentSource,
  environment: AppEnvironment,
): 24 | 48 {
  const raw = source.SITE_DELETION_GRACE_HOURS?.trim();
  if (!raw && (environment === "staging" || environment === "production")) {
    throw new AppConfigError(
      "SITE_DELETION_GRACE_HOURS",
      `it is required in ${environment}`,
    );
  }
  const value = Number(raw || "48");
  if (value !== 24 && value !== 48) {
    throw new AppConfigError(
      "SITE_DELETION_GRACE_HOURS",
      "expected 24 or 48",
    );
  }
  return value;
}

export function loadAppConfig(
  source: EnvironmentSource = process.env,
): Readonly<AppConfig> {
  const environment = readEnum(
    source,
    "APP_ENV",
    APP_ENVIRONMENTS,
    "local",
  );
  const logLevel = readEnum(source, "LOG_LEVEL", LOG_LEVELS, "info");
  const version = source.APP_VERSION?.trim() || "0.1.0";
  const commitSha = source.APP_COMMIT_SHA?.trim() || undefined;

  return Object.freeze({
    applicationName: "nexi",
    serviceName: "nexi-web",
    environment,
    publicUrl: readPublicUrl(source, environment),
    version,
    commitSha,
    logLevel,
    siteDeletionGraceHours: readDeletionGraceHours(source, environment),
  });
}

let cachedConfig: Readonly<AppConfig> | undefined;

export function getAppConfig(): Readonly<AppConfig> {
  cachedConfig ??= loadAppConfig();
  return cachedConfig;
}
