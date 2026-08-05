import type { AppEnvironment, EnvironmentSource } from "@/src/config/app-config";
import { APP_ENVIRONMENTS } from "@/src/config/app-config";

export type MediaStorageProvider = "local" | "unconfigured";

export interface MediaConfig {
  environment: AppEnvironment;
  provider: MediaStorageProvider;
  localServiceUrl?: string;
  uploadMaxBytes: number;
  maxWidth: number;
  maxHeight: number;
  maxPixels: number;
  maxConcurrentUploads: number;
  processingMode: "synchronous";
}

export class MediaConfigurationError extends Error {
  constructor(
    readonly variableName: string,
    reason: string,
  ) {
    super(`Invalid media configuration for ${variableName}: ${reason}`);
    this.name = "MediaConfigurationError";
  }
}

function integer(
  source: EnvironmentSource,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = source[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new MediaConfigurationError(
      name,
      `expected an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function environment(source: EnvironmentSource): AppEnvironment {
  const value = source.APP_ENV?.trim() || "local";
  if (!APP_ENVIRONMENTS.includes(value as AppEnvironment)) {
    throw new MediaConfigurationError("APP_ENV", "unsupported environment");
  }
  return value as AppEnvironment;
}

function localUrl(source: EnvironmentSource): string {
  const raw = source.MEDIA_LOCAL_SERVICE_URL?.trim() ||
    "http://127.0.0.1:43127";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new MediaConfigurationError(
      "MEDIA_LOCAL_SERVICE_URL",
      "expected a loopback HTTP URL",
    );
  }
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/"
  ) {
    throw new MediaConfigurationError(
      "MEDIA_LOCAL_SERVICE_URL",
      "only an unauthenticated loopback HTTP origin is allowed",
    );
  }
  return parsed.toString().replace(/\/$/, "");
}

export function loadMediaConfig(
  source: EnvironmentSource = process.env,
): Readonly<MediaConfig> {
  const appEnvironment = environment(source);
  const requestedProvider = source.MEDIA_STORAGE_PROVIDER?.trim() ||
    (appEnvironment === "local" || appEnvironment === "test"
      ? "local"
      : "unconfigured");
  if (!["local", "unconfigured"].includes(requestedProvider)) {
    throw new MediaConfigurationError(
      "MEDIA_STORAGE_PROVIDER",
      "expected local or unconfigured",
    );
  }
  if (
    requestedProvider === "local" &&
    !["local", "test"].includes(appEnvironment)
  ) {
    throw new MediaConfigurationError(
      "MEDIA_STORAGE_PROVIDER",
      "the local provider is forbidden outside local and test",
    );
  }
  if (
    ["staging", "production"].includes(appEnvironment) &&
    requestedProvider !== "unconfigured"
  ) {
    throw new MediaConfigurationError(
      "MEDIA_STORAGE_PROVIDER",
      "production media storage has not been authorized",
    );
  }
  const processingMode = source.MEDIA_PROCESSING_MODE?.trim() || "synchronous";
  if (processingMode !== "synchronous") {
    throw new MediaConfigurationError(
      "MEDIA_PROCESSING_MODE",
      "only synchronous is supported in local and CI",
    );
  }
  return Object.freeze({
    environment: appEnvironment,
    provider: requestedProvider as MediaStorageProvider,
    localServiceUrl:
      requestedProvider === "local" ? localUrl(source) : undefined,
    uploadMaxBytes: integer(
      source,
      "MEDIA_UPLOAD_MAX_BYTES",
      10 * 1024 * 1024,
      1024,
      100 * 1024 * 1024,
    ),
    maxWidth: integer(source, "MEDIA_MAX_WIDTH", 8000, 1, 20000),
    maxHeight: integer(source, "MEDIA_MAX_HEIGHT", 8000, 1, 20000),
    maxPixels: integer(source, "MEDIA_MAX_PIXELS", 40_000_000, 1, 100_000_000),
    maxConcurrentUploads: integer(
      source,
      "MEDIA_MAX_CONCURRENT_UPLOADS",
      2,
      1,
      16,
    ),
    processingMode,
  });
}
